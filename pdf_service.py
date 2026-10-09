"""Local PDF intake, grounded field mapping, and verified copy-only exports."""
import csv
import hashlib
import io
import math
import re
import subprocess
import tempfile
import threading
from pathlib import Path

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

# PDFium is not thread safe; all handles are opened and closed under this lock.
_PDFIUM_LOCK = threading.Lock()
_PROTECTED = re.compile(r"signature|thumbmark|provider|employer|official capacity|philhealth use|received by|receiving|accreditation", re.I)
_NAME = re.compile(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)*\Z")


def _reader(path):
    if path.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("PDF exceeds 10 MiB")
    try:
        reader = PdfReader(path, strict=True)
        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are unsupported")
        if not 1 <= len(reader.pages) <= 10:
            raise ValueError("PDF must contain 1 to 10 pages")
        form = reader.trailer["/Root"].get("/AcroForm")
        if form and form.get_object().get("/XFA"):
            raise ValueError("XFA forms are unsupported")
        for page in reader.pages:
            if page.rotation or list(page.mediabox) != list(page.cropbox) or list(page.mediabox)[:2] != [0, 0]:
                raise ValueError("Rotated or cropped PDFs are unsupported")
            if not all(0 < float(v) <= 2000 for v in list(page.mediabox)[2:]):
                raise ValueError("Unsupported PDF page dimensions")
        return reader
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Malformed or unsupported PDF") from exc


def _inherited(widget):
    chain, current, seen = [], widget, set()
    while current is not None:
        identity = id(current)
        if identity in seen or len(chain) >= 32:
            raise ValueError("Malformed widget inheritance")
        seen.add(identity)
        chain.append(current)
        parent = current.get("/Parent")
        current = parent.get_object() if parent else None
    properties = {}
    for node in reversed(chain):
        properties.update(node)
    properties["/T"] = ".".join(str(node["/T"]) for node in reversed(chain) if "/T" in node)
    return properties


def _widgets(reader):
    result = []
    for number, page in enumerate(reader.pages):
        for index, ref in enumerate(page.get("/Annots", [])):
            widget = ref.get_object()
            if widget.get("/Subtype") != "/Widget":
                continue
            data = _inherited(widget)
            flags, kind = int(data.get("/Ff", 0)), data.get("/FT")
            types = {"/Tx": "text", "/Ch": "choice", "/Sig": "signature"}
            field_type = types.get(kind)
            if kind == "/Btn":
                field_type = "button" if flags & 65536 else "radio" if flags & 32768 else "checkbox"
            if field_type is None or not data["/T"]:
                raise ValueError("Unsupported or unnamed form widget")
            options = []
            if kind == "/Ch":
                options = [str(item[0] if isinstance(item, list) else item) for item in data.get("/Opt", [])]
            elif kind == "/Btn":
                appearance = widget.get("/AP", {}).get("/N")
                if appearance:
                    options = [str(key).removeprefix("/") for key in appearance.get_object()]
            result.append({"id": f"p{number}-w{index}", "field_name": data["/T"], "page": number,
                           "rect": [float(v) for v in widget["/Rect"]], "type": field_type,
                           "options": options, "value": str(data.get("/V", "")).removeprefix("/"),
                           "max_length": int(data.get("/MaxLen", 0)), "flags": flags,
                           "protected": bool(flags & 1 or field_type in {"signature", "button"}
                                             or _PROTECTED.search(data["/T"]))})
    return result


def _native_page(page, number):
    textpage = page.get_textpage()
    try:
        text = textpage.get_text_range()
        if textpage.count_chars() > 100000:
            raise ValueError("PDF page text exceeds extraction limit")
        boxes = []
        for index in range(textpage.count_rects()):
            rect = list(textpage.get_rect(index))
            value = textpage.get_text_bounded(*rect).strip()
            if value:
                boxes.append({"id": f"p{number}-t{index}", "text": value, "rect": rect,
                              "confidence": 100.0, "source": "pdf_text"})
        return text, boxes
    finally:
        textpage.close()
