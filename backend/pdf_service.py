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


def _widget_entries(reader):
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
                raw_options = data.get("/Opt", [])
                raw_options = raw_options.get_object() if hasattr(raw_options, "get_object") else raw_options
                options = [str(item[0] if isinstance(item, list) else item) for item in raw_options]
                if flags & 2097152:
                    raise ValueError("Multiselect widgets are unsupported")
            elif kind == "/Btn" and field_type != "button":
                children = data.get("/Kids", [widget]) if field_type == "radio" else [widget]
                for child in children:
                    child = child.get_object()
                    appearance = child.get("/AP")
                    if appearance:
                        normal = appearance.get_object().get("/N")
                        if normal:
                            options.extend(str(key).removeprefix("/") for key in normal.get_object())
                options = list(dict.fromkeys(options))
            result.append({"id": f"p{number}-w{index}", "field_name": data["/T"], "page": number,
                           "rect": [float(v) for v in widget["/Rect"]], "type": field_type,
                           "options": options, "value": str(data.get("/V", "")).removeprefix("/"),
                           "max_length": int(data.get("/MaxLen", 0)), "flags": flags,
                           "protected": bool(flags & 1 or field_type in {"signature", "button"}
                                             or _PROTECTED.search(data["/T"]))})
    return result


def _widgets(reader):
    try:
        return _widget_entries(reader)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Malformed or unsupported form widgets") from exc


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


def _label_lines(boxes):
    lines = []
    for box in sorted(boxes, key=lambda item: (-item["rect"][1], item["rect"][0])):
        if lines and abs(lines[-1]["rect"][1] - box["rect"][1]) < 3:
            line = lines[-1]
            line["text"] += " " + box["text"]
            line["rect"] = [min(line["rect"][0], box["rect"][0]), min(line["rect"][1], box["rect"][1]),
                            max(line["rect"][2], box["rect"][2]), max(line["rect"][3], box["rect"][3])]
        else:
            lines.append({"text": box["text"], "rect": list(box["rect"])})
    return lines


def _protected_regions(page, kind):
    width, height = page["width"], page["height"]
    if kind == "annex_b":
        return [[0, 0, width, height]]
    regions = []
    for label in _label_lines(page["boxes"]):
        text, rect = label["text"], label["rect"]
        if kind == "cf1" and re.search(r"PART\s*III", text, re.I):
            regions.append([0, 0, width, min(height, rect[3] + 3)])
        if kind not in {"cf1", "pmrf"} and re.search(r"\b(?:provider|employer)\b", text, re.I):
            regions.append([0, 0, width, min(height, rect[3] + 3)])
        if re.search(r"(?:for\s+)?philhealth\s+use\s+only", text, re.I):
            regions.append([max(0, rect[0] - 5) if rect[0] > width / 2 else 0,
                            0, width, min(height, rect[3] + 3)])
        if _PROTECTED.search(text):
            regions.append([max(0, rect[0] - 4), max(0, rect[1] - 5),
                            min(width, rect[2] + 4), min(height, rect[3] + 26)])
    return regions


def _cell_intervals(edges):
    clean = []
    for edge in edges:
        if not clean or edge - clean[-1] > 1.5:
            clean.append(edge)
    intervals, index = [], 0
    while index < len(clean) - 1:
        end = index + 1
        width = clean[end] - clean[index]
        if width <= 20:
            while end < len(clean) - 1 and abs(clean[end + 1] - clean[end] - width) <= max(1, width * 0.15):
                end += 1
        if end - index < 3:
            end = index + 1
        intervals.append((clean[index], clean[end]))
        index = end
    return intervals


def _layout_boxes(page, segments):
    horizontal, vertical = [], []
    segments = list(segments)
    for box in page["boxes"]:
        if len(box["text"].strip()) >= 4 and not box["text"].strip("_ \r\n"):
            x0, y0, x1, y1 = box["rect"]
            segments.append((x0, y1, x1, y1))
    for x0, y0, x1, y1 in segments:
        if abs(y1 - y0) < 0.6 and abs(x1 - x0) >= 5:
            line = (min(x0, x1), (y0 + y1) / 2, max(x0, x1))
            if not any(abs(old[1] - line[1]) < 1.5 and abs(old[0] - line[0]) < 2 and abs(old[2] - line[2]) < 2 for old in horizontal):
                horizontal.append(line)
        elif abs(x1 - x0) < 0.6 and abs(y1 - y0) >= 5:
            vertical.append(((x0 + x1) / 2, min(y0, y1), max(y0, y1)))
    boxes = []
    for left, bottom, right in sorted(horizontal, key=lambda line: (line[1], line[0])):
        edges = sorted({round(x, 1) for x, low, high in vertical
                        if left - 1 <= x <= right + 1 and low <= bottom + 1 and high >= bottom + 6})
        intervals = _cell_intervals(edges) if len(edges) >= 2 else [(left, right)]
        for x0, x1 in intervals:
            tops = [y for start, y, end in horizontal if 6 <= y - bottom <= 35 and start <= x0 + 1 and end >= x1 - 1]
            boundaries = tops or [box["rect"][1] for box in page["boxes"]
                                  if box["text"].strip("_ .") and 8 <= box["rect"][1] - bottom <= 35
                                  and box["rect"][0] < x1 and box["rect"][2] > x0]
            if not boundaries:
                continue
            top = min(boundaries)
            rect = [x0 + 1, bottom + 1, x1 - 1, top - 1]
            try:
                _valid_rect(rect, page)
            except ValueError:
                continue
            if any(_intersects(rect, box["rect"]) for box in page["boxes"] if box["text"].strip("_ .")):
                continue
            if any(_intersects(rect, box["rect"]) for box in boxes):
                continue
            labels = sorted((box for box in page["boxes"] if box["text"].strip("_ .")),
                            key=lambda box: abs(box["rect"][1] - bottom) + abs(box["rect"][0] - x0) / 4)
            label = labels[0] if labels else {"text": "", "confidence": 100.0}
            is_check = bool(tops) and len(edges) <= 3 and 5 <= x1 - x0 <= 10.5 and 5 <= top - bottom <= 10.5
            if not is_check and x1 - x0 < 7:
                continue
            boxes.append({"id": f"p{page['page']}-b{len(boxes)}", "text": label["text"],
                          "rect": rect, "confidence": label["confidence"], "source": "layout",
                          "type": "checkbox" if is_check else "text", "options": ["Off", "Yes"] if is_check else [],
                          "protected": bool(_PROTECTED.search(label["text"]))
                          or any(_intersects(rect, region) for region in page["protected_regions"])})
    return boxes


def inspect_document(path: Path, document_id: str) -> dict:
    reader = _reader(path)
    pages, segments_by_page = [], []
    try:
        with _PDFIUM_LOCK, pdfium.PdfDocument(str(path)) as document:
            if len(document) != len(reader.pages):
                raise ValueError("Inconsistent PDF page tree")
            for number in range(len(document)):
                page = document[number]
                try:
                    text, boxes = _native_page(page, number)
                    if text.strip():
                        segments = _vector_lines(reader.pages[number])
                    else:
                        text, boxes, segments = _ocr_page(page, number)
                    width, height = page.get_size()
                    pages.append({"page": number, "width": width, "height": height, "text": text, "boxes": boxes})
                    segments_by_page.append(segments)
                finally:
                    page.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("PDF extraction failed") from exc
    widgets = _widgets(reader)
    text = " ".join(page["text"] for page in pages)
    if re.search(r"PROVIDER\s+DATA\s+RECORD|PDR[-\s]*HF", text, re.I):
        kind = "annex_b"
    elif re.search(r"PHILHEALTH\s+MEMBER\s+REGISTRATION\s+FORM|PMRF", text, re.I):
        kind = "pmrf"
    elif re.search(r"CF\s*[-–]?\s*1\b|CLAIM\s+FORM\s+1", text, re.I):
        kind = "cf1"
    else:
        kind = "acroform" if widgets else "fixed_layout"
    for page, segments in zip(pages, segments_by_page):
        page["protected_regions"] = _protected_regions(page, kind)
        page["boxes"].extend(_layout_boxes(page, segments))
    for widget in widgets:
        page = pages[widget["page"]]
        _valid_rect(widget["rect"], page)
        widget["protected"] |= any(_intersects(widget["rect"], region) for region in page["protected_regions"])
    return {"document_id": document_id, "document_kind": kind, "page_count": len(pages),
            "pages": pages, "widgets": widgets, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def _mapping_candidate(structure, candidate):
    if not isinstance(candidate, dict) or not isinstance(candidate.get("fields"), list):
        raise ValueError("Malformed mapping candidate")
    targets = {widget["id"]: widget for widget in structure["widgets"]}
    for page in structure["pages"]:
        targets.update({box["id"]: {**box, "page": page["page"]} for box in page["boxes"] if box["source"] == "layout"})
    names, used, fields = set(), set(), []
    for field in candidate["fields"]:
        if not isinstance(field, dict) or not isinstance(field.get("name"), str) or not _NAME.fullmatch(field["name"]):
            raise ValueError("Invalid logical field name")
        if field["name"] in names or not isinstance(field.get("label"), str) or not isinstance(field.get("required"), bool):
            raise ValueError("Duplicate or malformed logical field")
        names.add(field["name"])
        keys = [key for key in ("widget_id", "box_id") if field.get(key) is not None]
        if len(keys) != 1 or not isinstance(field[keys[0]], str) or field[keys[0]] not in targets:
            raise ValueError("Unknown mapping target")
        key, target = keys[0], targets[field[keys[0]]]
        if (key == "widget_id") != ("field_name" in target):
            raise ValueError("Mapping target kind mismatch")
        identity = target.get("field_name", target["id"])
        if identity in used:
            raise ValueError("Duplicate mapping target")
        used.add(identity)
        page = structure["pages"][target["page"]]
        _valid_rect(field.get("rect"), page)
        if field.get("page") != target["page"] or field["rect"] != target["rect"]:
            raise ValueError("Mapping geometry is not grounded in extracted structure")
        if field.get("type") != target["type"] or field.get("options") != target["options"]:
            raise ValueError("Mapping type or options mismatch")
        if not isinstance(field.get("protected"), bool) or field["protected"] != target["protected"]:
            raise ValueError("Mapping protection mismatch")
        if any(prior["page"] == field["page"] and _intersects(prior["rect"], field["rect"]) for prior in fields):
            raise ValueError("Mapped fields overlap")
        if key == "box_id" and any(widget["page"] == field["page"] and _intersects(widget["rect"], field["rect"]) for widget in structure["widgets"]):
            raise ValueError("Overlay mapping overlaps a form widget")
        fields.append(dict(field))
    if not any(not field["protected"] and field["type"] in {"text", "checkbox", "radio", "choice"} for field in fields):
        raise ValueError("Mapping contains no patient-editable fields")
    return {"rank": candidate["rank"], "fields": fields}


def validate_mapping(structure: dict, candidates: list) -> dict:
    if not isinstance(candidates, list):
        raise ValueError("Mapping candidates must be a list")
    ranked = [candidate for candidate in candidates if isinstance(candidate, dict)
              and isinstance(candidate.get("rank"), (float, int)) and not isinstance(candidate["rank"], bool)
              and math.isfinite(candidate["rank"])]
    for candidate in sorted(ranked, key=lambda item: item["rank"], reverse=True):
        try:
            return _mapping_candidate(structure, candidate)
        except (ValueError, KeyError, TypeError, IndexError):
            continue
    raise ValueError("No structurally valid mapping candidate")


def render_preview(path: Path, destination: Path, page: int = 0) -> None:
    reader = _reader(path)
    if isinstance(page, bool) or not isinstance(page, int) or not 0 <= page < len(reader.pages):
        raise ValueError("Invalid preview page")
    if destination.resolve() == path.resolve():
        raise ValueError("Preview cannot overwrite source")
    try:
        with _PDFIUM_LOCK, pdfium.PdfDocument(str(path)) as document:
            document.init_forms()
            rendered = document[page]
            try:
                bitmap = rendered.render(scale=1.5)
                try:
                    image = bitmap.to_pil()
                    image.save(destination, format="PNG")
                    image.close()
                finally:
                    bitmap.close()
            finally:
                rendered.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("PDF preview rendering failed") from exc


def _write_values(structure, mapping, values):
    fields = {field["name"]: field for field in mapping["fields"]}
    if not isinstance(values, dict) or any(name not in fields for name in values):
        raise ValueError("Unknown supplied field")
    widgets = {widget["id"]: widget for widget in structure["widgets"]}
    supplied = []
    for name, value in values.items():
        field = fields[name]
        if not isinstance(value, str):
            raise ValueError("Field values must be strings")
        if not value:
            continue
        if field["protected"] or structure["document_kind"] == "annex_b":
            raise ValueError("Protected fields cannot be populated")
        if field["type"] not in {"text", "checkbox", "radio", "choice"}:
            raise ValueError("Unsupported writable field type")
        if any(ord(character) < 32 for character in value):
            raise ValueError("Multiline or control-character field values are unsupported")
        try:
            value.encode("cp1252")
        except UnicodeError as exc:
            raise ValueError("Field value is unsupported by the form font") from exc
        if field["type"] in {"checkbox", "radio", "choice"} and value not in field["options"]:
            raise ValueError("Unknown field option")
        if "widget_id" in field and widgets[field["widget_id"]]["max_length"] and len(value) > widgets[field["widget_id"]]["max_length"]:
            raise ValueError("Field value exceeds widget length")
        rect = field["rect"]
        if field["type"] in {"text", "choice"} and (rect[3] - rect[1] < 9 or stringWidth(value, "Helvetica", 9) > rect[2] - rect[0] - 2):
            raise ValueError("Field value overflows its writable region")
        supplied.append((field, value))
    return supplied


def _widget_changes(structure, mapping, supplied):
    widgets = {widget["id"]: widget for widget in structure["widgets"]}
    changes = {widgets[field["widget_id"]]["field_name"]: "Off" if field["type"] in {"checkbox", "radio"} else ""
               for field in mapping["fields"] if "widget_id" in field and not field["protected"]}
    for field, value in supplied:
        if "widget_id" not in field:
            continue
        target = widgets[field["widget_id"]]
        changes[target["field_name"]] = value
    return changes


def _fill_widgets(writer, structure, mapping, supplied):
    changes = _widget_changes(structure, mapping, supplied)
    if not changes:
        return
    from pypdf.generic import TextStringObject, NameObject
    for page in writer.pages:
        for reference in page.get("/Annots", []):
            widget = reference.get_object()
            if widget.get("/Subtype") != "/Widget":
                continue
            inherited = _inherited(widget)
            if inherited["/T"] not in changes or inherited.get("/FT") != "/Tx":
                continue
            appearance = str(inherited.get("/DA", ""))
            appearance, count = re.subn(r"(/[^\s]+\s+)[-+]?\d*\.?\d+(\s+Tf)", r"\g<1>9\2", appearance)
            if not count:
                raise ValueError("Text widget has no supported font appearance")
            widget[NameObject("/DA")] = TextStringObject(appearance)
    writer.update_page_form_field_values(None, changes, auto_regenerate=False)


def _overlay_page(page, supplied):
    stream = io.BytesIO()
    canvas = Canvas(stream, pagesize=(float(page.mediabox.width), float(page.mediabox.height)))
    canvas.setFont("Helvetica", 9)
    for field, value in supplied:
        x0, y0, x1, y1 = field["rect"]
        if field["type"] == "checkbox":
            if value == "Off":
                continue
            canvas.line(x0 + 1, y0 + 1, x1 - 1, y1 - 1)
            canvas.line(x0 + 1, y1 - 1, x1 - 1, y0 + 1)
        elif field["type"] == "text":
            canvas.drawString(x0 + 1, y0 + (y1 - y0 - 9) / 2 + 2, value)
        else:
            raise ValueError("Unsupported overlay field type")
    canvas.save()
    stream.seek(0)
    page.merge_page(PdfReader(stream).pages[0])


def _verify_written(path, structure, mapping, supplied):
    reader = _reader(path)
    after = {widget["id"]: widget for widget in _widgets(reader)}
    before = {widget["id"]: widget for widget in structure["widgets"]}
    changes = _widget_changes(structure, mapping, supplied)
    if set(after) != set(before) or len(reader.pages) != structure["page_count"]:
        raise ValueError("Written PDF structure changed unexpectedly")
    affected = {field["page"] for field, value in supplied}
    for identity, widget in before.items():
        expected = changes.get(widget["field_name"], widget["value"])
        if after[identity]["value"] != expected:
            raise ValueError("Written widget value verification failed")
        if widget["field_name"] in changes:
            affected.add(widget["page"])
    with _PDFIUM_LOCK, pdfium.PdfDocument(str(path)) as document:
        document.init_forms()
        for number in sorted(affected or {0}):
            page = document[number]
            try:
                textpage = page.get_textpage()
                try:
                    for field, value in supplied:
                        if field["page"] == number and "box_id" in field and field["type"] == "text":
                            written = textpage.get_text_bounded(*field["rect"]).strip()
                            if written != value:
                                raise ValueError("Written overlay value verification failed")
                finally:
                    textpage.close()
                bitmap = page.render(scale=1.5)
                try:
                    image = bitmap.to_pil()
                    encoded = io.BytesIO()
                    image.save(encoded, format="PNG")
                    image.close()
                    if not encoded.getvalue().startswith(b"\x89PNG\r\n\x1a\n"):
                        raise ValueError("Written PDF render verification failed")
                finally:
                    bitmap.close()
            finally:
                page.close()


def export_pdf(source: Path, destination: Path, structure: dict, mapping: dict, values: dict) -> None:
    if source.resolve() == destination.resolve() or (destination.exists() and source.samefile(destination)):
        raise ValueError("Export must use a separate destination")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != structure.get("sha256"):
        raise ValueError("Source PDF changed after extraction")
    mapping = validate_mapping(structure, [mapping])
    supplied = _write_values(structure, mapping, values)
    try:
        writer = PdfWriter(clone_from=_reader(source))
        _fill_widgets(writer, structure, mapping, supplied)
        for number, page in enumerate(writer.pages):
            overlays = [(field, value) for field, value in supplied if field["page"] == number and "box_id" in field]
            if overlays:
                _overlay_page(page, overlays)
        with tempfile.TemporaryDirectory(prefix=".pdf-export-", dir=destination.parent) as directory:
            temporary = Path(directory) / "verified.pdf"
            writer.write(temporary)
            _verify_written(temporary, structure, mapping, supplied)
            if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
                raise ValueError("Source PDF changed during export")
            temporary.replace(destination)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("PDF writing or verification failed") from exc
