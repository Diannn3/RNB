"""Generate the explicitly synthetic interactive copy; never modify the official PMRF.

Run from the repository root: .venv/bin/python -m scripts.make_pmrf_fixture
"""
import hashlib
import io
import re
import tempfile
import unicodedata
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, NameObject, RectangleObject
from reportlab.pdfgen.canvas import Canvas

from backend.pdf_service import export_pdf, inspect_document

ROOT = Path(__file__).resolve().parent.parent
FORMS = ROOT / "skills" / "government-form-assistant" / "assets" / "forms"
SOURCE = FORMS / "philhealth-pmrf-012020.pdf"
DESTINATION = FORMS / "synthetic-pmrf-acroform.pdf"
MARKER = "SYNTHETIC INTERACTIVE DEMO COPY - NOT THE OFFICIAL FILLABLE SOURCE"


def generate_fixture(source: Path = SOURCE, destination: Path = DESTINATION) -> dict:
    if source.resolve() == destination.resolve():
        raise ValueError("Synthetic fixture must not replace its source")
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    structure = inspect_document(source, "official-pmrf-fixture-source")
    if structure["document_kind"] != "pmrf" or structure["widgets"]:
        raise ValueError("Expected the official fixed-layout PMRF source")
    stream, expected = io.BytesIO(), {}
    canvas = Canvas(stream)
    for page in structure["pages"]:
        canvas.setPageSize((page["width"], page["height"]))
        canvas.saveState()
        canvas.translate(7, 100)
        canvas.rotate(90)
        canvas.setFont("Helvetica", 6)
        canvas.drawString(0, 0, MARKER)
        canvas.restoreState()
        for box in page["boxes"]:
            if box["source"] != "layout" or box["protected"] or box["type"] not in {"text", "checkbox"}:
                continue
            if not box["text"].strip():
                continue
            x0, y0, x1, y1 = box["rect"]
            label = unicodedata.normalize("NFKD", box["text"]).encode("ascii", "ignore").decode()
            name = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:70]
            name = f"{name}_{box['id'].replace('-', '_')}"
            tooltip = f"Synthetic demo field; source box {box['id']}; {box['text']}"
            if box["type"] == "text":
                if y1 - y0 < 9 or x1 - x0 < 10:
                    continue
                canvas.acroForm.textfield(name=name, tooltip=tooltip, x=x0, y=y0, width=x1 - x0,
                                          height=y1 - y0, fontName="Helvetica", fontSize=9,
                                          borderWidth=0, fillColor=None, forceBorder=False)
            else:
                if box["options"] != ["Off", "Yes"]:
                    raise ValueError("Unexpected grounded checkbox options")
                canvas.acroForm.checkbox(name=name, tooltip=tooltip, x=x0, y=y0, size=min(x1 - x0, y1 - y0),
                                         borderWidth=0, fillColor=None, forceBorder=False)
            expected[name] = {"page": page["page"], "rect": box["rect"], "type": box["type"]}
        canvas.showPage()
    canvas.save()
    if not expected:
        raise ValueError("No applicant-answerable PMRF regions were extracted")
    overlay = PdfReader(io.BytesIO(stream.getvalue()))
    writer = PdfWriter(clone_from=PdfReader(source))
    writer._root_object[NameObject("/AcroForm")] = overlay.trailer["/Root"]["/AcroForm"].clone(writer)
    for number, overlay_page in enumerate(overlay.pages):
        annotations = list(overlay_page.get("/Annots", []))
        if "/Annots" in overlay_page:
            del overlay_page["/Annots"]
        page = writer.pages[number]
        page.merge_page(overlay_page)
        combined = list(page.get("/Annots", []))
        for reference in annotations:
            widget = reference.get_object().clone(writer)
            widget[NameObject("/P")] = page.indirect_reference
            widget[NameObject("/Rect")] = RectangleObject(expected[str(widget["/T"])]["rect"])
            combined.append(widget.indirect_reference)
        page[NameObject("/Annots")] = ArrayObject(combined)
    writer.add_metadata({"/Title": "Synthetic interactive PMRF demo copy", "/Subject": MARKER,
                         "/PapellessSourceSHA256": original_hash})
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix=".synthetic-pmrf-") as directory:
        temporary = Path(directory) / "synthetic.pdf"
        writer.write(temporary)
        result = inspect_document(temporary, "synthetic-pmrf-fixture")
        if len(result["widgets"]) != len(expected):
            raise ValueError("Synthetic fixture lost grounded widgets")
        for widget in result["widgets"]:
            grounded = expected[widget["field_name"]]
            if widget["protected"] or widget["page"] != grounded["page"] or widget["type"] != grounded["type"]:
                raise ValueError("Synthetic widget validation failed")
            if any(abs(actual - wanted) > 0.001 for actual, wanted in zip(widget["rect"], grounded["rect"])):
                raise ValueError("Synthetic widget geometry changed")
        target = next(widget for widget in result["widgets"]
                      if widget["type"] == "text" and widget["rect"][2] - widget["rect"][0] >= 50)
        field = {"name": "demo_value", "label": "Synthetic fixture smoke", "required": False,
                 "widget_id": target["id"], **{key: target[key] for key in ("page", "rect", "type", "options", "protected")}}
        export_pdf(temporary, Path(directory) / "smoke-DRAFT.pdf", result, {"rank": 1, "fields": [field]},
                   {"demo_value": "DEMO"})
        if hashlib.sha256(source.read_bytes()).hexdigest() != original_hash:
            raise ValueError("Official source changed during fixture generation")
        temporary.replace(destination)
    return {"page_count": result["page_count"], "widget_count": len(result["widgets"]),
            "widgets_per_page": [sum(widget["page"] == page for widget in result["widgets"])
                                 for page in range(result["page_count"])], "source_sha256": original_hash}


if __name__ == "__main__":
    print(generate_fixture())
