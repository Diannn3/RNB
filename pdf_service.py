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


def _ocr_page(page, number):
    scale = 3
    width, height = page.get_size()
    if width * height * scale * scale > 40_000_000:
        raise ValueError("PDF page exceeds raster processing limit")
    bitmap = page.render(scale=scale)
    try:
        image = bitmap.to_pil().copy()
    finally:
        bitmap.close()
    encoded = io.BytesIO()
    image.save(encoded, format="PNG")
    try:
        process = subprocess.run(["tesseract", "stdin", "stdout", "-l", "eng", "--psm", "6", "tsv"],
                                 input=encoded.getvalue(), capture_output=True, timeout=90, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError("Local Tesseract OCR is unavailable") from exc
    if process.returncode:
        raise ValueError("Tesseract OCR failed")
    boxes, lines = [], {}
    try:
        rows = csv.DictReader(io.StringIO(process.stdout.decode("utf-8")), delimiter="\t")
        for row in rows:
            value = row["text"].strip()
            confidence = float(row["conf"])
            if not value or confidence < 0:
                continue
            x, y, w, h = (int(row[key]) for key in ("left", "top", "width", "height"))
            boxes.append({"id": f"p{number}-o{len(boxes)}", "text": value,
                          "rect": [x / scale, height - (y + h) / scale, (x + w) / scale, height - y / scale],
                          "confidence": confidence, "source": "ocr"})
            key = tuple(row[key] for key in ("block_num", "par_num", "line_num"))
            lines.setdefault(key, []).append(value)
    except (KeyError, UnicodeError, ValueError) as exc:
        raise ValueError("Invalid OCR result") from exc
    segments = _raster_lines(image, height, scale)
    image.close()
    return "\n".join(" ".join(words) for words in lines.values()), boxes, segments


def _raster_lines(image, height, scale):
    gray = image.convert("L").point(lambda pixel: 0 if pixel < 100 else 255)
    segments = []
    try:
        for axis in (0, 1):
            size = gray.width if axis == 0 else gray.height
            limit = gray.height if axis == 0 else gray.width
            for index in range(limit):
                crop = gray.crop((0, index, size, index + 1) if axis == 0 else (index, 0, index + 1, size))
                data = crop.tobytes()
                crop.close()
                for run in re.finditer(b"\x00{" + str(int(5 * scale)).encode() + b",}", data):
                    start, end = run.span()
                    if axis == 0:
                        segments.append((start / scale, height - index / scale, end / scale, height - index / scale))
                    else:
                        segments.append((index / scale, height - end / scale, index / scale, height - start / scale))
                    if len(segments) > 50000:
                        raise ValueError("Raster layout exceeds processing limit")
    finally:
        gray.close()
    return segments


def _vector_lines(page):
    segments, current, origin = [], None, None

    def visit(operator, operands, matrix, text_matrix):
        nonlocal current, origin

        def point(x, y):
            a, b, c, d, e, f = (float(value) for value in matrix)
            return a * float(x) + c * float(y) + e, b * float(x) + d * float(y) + f

        if operator == b"m":
            current = origin = point(*operands)
        elif operator == b"l" and current is not None:
            end = point(*operands)
            segments.append((*current, *end))
            current = end
        elif operator == b"h" and current is not None and origin is not None:
            segments.append((*current, *origin))
            current = origin
        elif operator == b"re":
            x, y, w, h = (float(value) for value in operands)
            corners = [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)]
            segments.extend((*corners[index], *corners[(index + 1) % 4]) for index in range(4))
        if len(segments) > 50000:
            raise ValueError("PDF layout exceeds processing limit")

    page.extract_text(visitor_operand_before=visit)
    return segments


def _intersects(first, second, tolerance=0.1):
    return (min(first[2], second[2]) - max(first[0], second[0]) > tolerance
            and min(first[3], second[3]) - max(first[1], second[1]) > tolerance)


def _valid_rect(rect, page):
    if not isinstance(rect, list) or len(rect) != 4 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in rect):
        raise ValueError("Invalid mapping geometry")
    x0, y0, x1, y1 = rect
    if not (0 <= x0 < x1 <= page["width"] and 0 <= y0 < y1 <= page["height"]):
        raise ValueError("Mapping geometry exceeds page bounds")
