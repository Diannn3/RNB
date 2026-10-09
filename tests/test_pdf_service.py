"""Run with python -m unittest tests.test_pdf_service after provisioning PDF dependencies."""
import hashlib
import tempfile
import unittest
from pathlib import Path

from reportlab.pdfgen.canvas import Canvas

from backend.pdf_service import _cell_intervals, _intersects, _layout_boxes, _protected_regions, export_pdf, inspect_document, validate_mapping


def field_for(target, widget=False):
    return {"id": target["id"], "name": "member_name", "label": "Member name", "required": True,
            "type": target["type"], "options": target["options"],
            "widget_id" if widget else "box_id": target["id"],
            "page": target.get("page", 0), "rect": target["rect"], "protected": target["protected"]}


class PdfBehavior(unittest.TestCase):
    def test_interleaved_ocr_protects_staff_and_header_not_client_fields(self):
        page = {"width": 600, "height": 800, "boxes": [
            {"text": "To be filled out Client Partl: Client by", "rect": [30, 700, 500, 715]},
            {"text": "Il: Personnel Part To be Filled out DSWD Personnel by",
             "rect": [30, 450, 500, 465]},
        ]}
        regions = _protected_regions(page, "fixed_layout")
        for forbidden in ([40, 740, 200, 760], [40, 400, 200, 420]):
            self.assertTrue(any(_intersects(forbidden, region) for region in regions))
        self.assertFalse(any(_intersects([40, 600, 200, 620], region) for region in regions))

    def test_agency_use_only_fields_cannot_be_exported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for agency in ("DSWD", "SSS", "PhilHealth"):
                with self.subTest(agency=agency):
                    source = root / "source.pdf"
                    canvas = Canvas(str(source))
                    canvas.drawString(40, 720, f"For {agency} use only")
                    canvas.acroForm.textfield(name=f"{agency.lower()} use only",
                                              tooltip=f"For {agency} use only",
                                              x=40, y=680, width=200, height=20)
                    canvas.save()
                    structure = inspect_document(source, "agency-form")
                    target = structure["widgets"][0]
                    mapping = {"rank": 1, "fields": [field_for(target, widget=True)]}
                    with self.assertRaises(ValueError):
                        export_pdf(source, root / "source-DRAFT.pdf", structure,
                                   mapping, {"member_name": "FORBIDDEN"})

    def test_two_character_cells_merge_without_absorbing_wide_fields(self):
        self.assertEqual(_cell_intervals([0, 12.3, 24.6]), [(0, 24.6)])
        self.assertEqual(_cell_intervals([0, 12.3, 24.6, 120]), [(0, 24.6), (24.6, 120)])

    def test_printed_labels_do_not_create_writable_regions(self):
        page = {"page": 0, "width": 300, "height": 300, "protected_regions": [],
                "boxes": [{"text": "Member name", "rect": [40, 140, 140, 152], "confidence": 100.0},
                          {"text": "Last name", "rect": [40, 110, 120, 122], "confidence": 100.0}]}
        self.assertEqual(_layout_boxes(page, []), [])

    def test_official_cf1_source_regions_and_section_labels(self):
        source = Path(__file__).resolve().parents[1] / "skills/government-form-assistant/assets/forms/philhealth-cf1-092018.pdf"
        original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        structure = inspect_document(source, "official-cf1")
        self.assertEqual(structure["document_kind"], "cf1")
        page = structure["pages"][0]
        writable = [box for box in page["boxes"] if box["source"] == "layout" and not box["protected"]]
        member = [box for box in writable if "Section: PART I - MEMBER INFORMATION" in box["context"]]
        patient = [box for box in writable if "Section: PART II - PATIENT INFORMATION" in box["context"]]
        self.assertTrue(member)
        self.assertTrue(patient)
        self.assertEqual(len(member) + len(patient), len(writable))
        for section in (member, patient):
            for label in ("Last Name", "First Name", "Name Extension", "Middle Name"):
                self.assertEqual(sum(box["text"] == label for box in section), 1, label)
            dates = [box for box in section if box["text"].lower() in {"month", "day", "year"}]
            self.assertEqual({box["text"].lower() for box in dates}, {"month", "day", "year"})
            self.assertEqual(len(dates), 3)
            for box in dates:
                self.assertIn(f"Character cells: {4 if box['text'].lower() == 'year' else 2}", box["context"])
            pins = [box for box in section if "Identification Number (PIN)" in box["text"]]
            self.assertEqual(len(pins), 3)
            for index, (box, cells) in enumerate(zip(sorted(pins, key=lambda box: box["rect"][0]), (2, 9, 1)), 1):
                self.assertIn(f"Character cells: {cells}", box["context"])
                self.assertIn(f"Group: {index} of 3", box["context"])
            self.assertEqual({box["text"] for box in section if box["type"] == "checkbox" and box["text"] in {"Male", "Female"}},
                             {"Male", "Female"})
        for label in ("Landline No. (Area Code + Tel. No.)", "Mobile No.", "Email Address"):
            self.assertEqual(sum(box["text"] == label for box in member), 1, label)
        self.assertEqual({box["text"] for box in patient if box["type"] == "checkbox"} - {"Male", "Female"},
                         {"Child", "Parent", "Spouse"})
        certification = next(box for box in page["boxes"]
                             if box["source"] == "pdf_text" and box["text"].startswith("PART III"))
        protected_below = [box for box in page["boxes"] if box["source"] == "layout"
                           and box["rect"][3] <= certification["rect"][3] + 3]
        self.assertTrue(protected_below)
        self.assertTrue(all(box["protected"] for box in protected_below))
        for box in writable:
            self.assertFalse(any(_intersects(box["rect"], region) for region in page["protected_regions"]))
            self.assertFalse(any(_intersects(box["rect"], printed["rect"]) for printed in page["boxes"]
                                 if printed["source"] == "pdf_text" and printed["text"].strip("_ .")))
            if box["type"] == "text":
                self.assertGreaterEqual(box["rect"][3] - box["rect"][1], 9)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original_hash)

    def test_grounded_copy_only_overlay_and_widget_exports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for widget in (False, True):
                source, output = root / "source.pdf", root / "member-DRAFT.pdf"
                canvas = Canvas(str(source), pagesize=(300, 300))
                canvas.drawString(40, 140, "Member name")
                if widget:
                    canvas.acroForm.textfield(name="member_name", value="OLD", x=40, y=100, width=180, height=22)
                    canvas.acroForm.textfield(name="signature", x=40, y=45, width=180, height=22)
                    canvas.acroForm.textfield(name="other_name", x=40, y=200, width=180, height=22)
                else:
                    canvas.rect(40, 100, 180, 22)
                    canvas.rect(40, 45, 180, 22)
                    canvas.drawString(40, 32, "Signature")
                    canvas.drawString(40, 235, "Member name")
                    canvas.rect(40, 200, 180, 22)
                canvas.save()
                original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
                structure = inspect_document(source, "synthetic")
                targets = structure["widgets"] if widget else structure["pages"][0]["boxes"]
                target = next(target for target in targets if target.get("type") == "text"
                              and not target["protected"] and 100 <= target["rect"][1] < 150)
                field = field_for(target, widget)
                bad = {"rank": 10, "fields": [{**field, "rect": [0, 0, 100, 20]}]}
                mapping = validate_mapping(structure, [{"rank": 20, "fields": []}, bad, {"rank": 1, "fields": [field]}])
                self.assertEqual(mapping["rank"], 1)
                with self.assertRaises(ValueError):
                    validate_mapping(structure, [{"rank": 20, "fields": []}])
                if widget:
                    export_pdf(source, output, structure, mapping, {})
                    blank = inspect_document(output, "blank")
                    self.assertEqual(next(item["value"] for item in blank["widgets"] if item["field_name"] == "member_name"), "")
                export_pdf(source, output, structure, mapping, {target["id"]: "ALPHA"})
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original_hash)
                after = inspect_document(output, "export")
                if widget:
                    self.assertEqual(next(item["value"] for item in after["widgets"] if item["field_name"] == "member_name"), "ALPHA")
                else:
                    self.assertIn("ALPHA", after["pages"][0]["text"])
                protected = next(target for target in targets if target.get("protected") and target.get("type") == "text")
                locked = {**field_for(protected, widget), "name": "signature"}
                locked_mapping = validate_mapping(structure, [{"rank": 1, "fields": [field, locked]}])
                with self.assertRaises(ValueError):
                    export_pdf(source, output, structure, locked_mapping, {protected["id"]: "FORBIDDEN"})
                with self.assertRaises(ValueError):
                    export_pdf(source, source, structure, mapping, {target["id"]: "ALPHA"})
                other = next(t for t in targets if t.get("type") == "text"
                             and not t["protected"] and t["rect"][1] >= 200)
                repeated = field_for(other, widget)
                duplicate_mapping = validate_mapping(
                    structure, [{"rank": 1, "fields": [field, repeated]}])
                export_pdf(source, output, structure, duplicate_mapping,
                           {field["id"]: "ADA", repeated["id"]: "BEA"})
                after = inspect_document(output, "separate")
                if widget:
                    self.assertEqual([w["value"] for w in after["widgets"] if not w["protected"]],
                                     ["ADA", "BEA"])
                else:
                    import pypdfium2 as pdfium
                    with pdfium.PdfDocument(str(output)) as document:
                        page = document[0]
                        text = page.get_textpage()
                        try:
                            self.assertEqual(text.get_text_bounded(*field["rect"]).strip(), "ADA")
                            self.assertEqual(text.get_text_bounded(*repeated["rect"]).strip(), "BEA")
                        finally:
                            text.close()
                            page.close()
                with self.assertRaises(ValueError):
                    validate_mapping(structure, [{"rank": 1, "fields": [
                        {**field, "id": repeated["id"]}]}])


if __name__ == "__main__":
    unittest.main()
