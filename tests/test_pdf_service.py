"""Run with python -m unittest tests.test_pdf_service after provisioning PDF dependencies."""
import hashlib
import tempfile
import unittest
from pathlib import Path

from reportlab.pdfgen.canvas import Canvas

from backend.pdf_service import export_pdf, inspect_document, validate_mapping


def field_for(target, widget=False):
    return {"name": "member_name", "label": "Member name", "required": True,
            "type": target["type"], "options": target["options"],
            "widget_id" if widget else "box_id": target["id"],
            "page": target.get("page", 0), "rect": target["rect"], "protected": target["protected"]}


class PdfBehavior(unittest.TestCase):
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
                else:
                    canvas.rect(40, 100, 180, 22)
                    canvas.rect(40, 45, 180, 22)
                    canvas.drawString(40, 32, "Signature")
                canvas.save()
                original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
                structure = inspect_document(source, "synthetic")
                targets = structure["widgets"] if widget else structure["pages"][0]["boxes"]
                target = next(target for target in targets if target.get("type") == "text"
                              and not target["protected"] and target["rect"][1] >= 100)
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
                export_pdf(source, output, structure, mapping, {"member_name": "ALPHA"})
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
                    export_pdf(source, output, structure, locked_mapping, {"signature": "FORBIDDEN"})
                with self.assertRaises(ValueError):
                    export_pdf(source, source, structure, mapping, {"member_name": "ALPHA"})


if __name__ == "__main__":
    unittest.main()
