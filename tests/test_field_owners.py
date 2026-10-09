"""Regression checks for repeated owners and visually verified AICS OCR labels."""
import unittest
from pathlib import Path
from backend.field_guidance import explain_field, grounded_question, match_field
from backend.pdf_service import inspect_document

FORMS = Path(__file__).resolve().parents[1] / 'skills/government-form-assistant/assets/forms'


class OwnerTests(unittest.TestCase):
    def test_sss_original_source_roles_and_date_parts(self):
        structure = inspect_document(FORMS / 'sss-e1-personal-record.pdf', 'sss')
        roles = {'p0-b0': 'registrant', 'p0-b31': 'father', 'p0-b35': 'mother',
                 'p0-b40': 'spouse', 'p0-b47': 'child'}
        for identity, role in roles.items():
            entry = match_field(structure, {'id': identity})[1]
            self.assertIsNotNone(entry, identity)
            self.assertIn(role, entry['owner'].lower(), identity)
        for owner, start in [('registrant', 4), ('spouse', 44)]:
            for part, offset in [('month', 0), ('day', 1), ('year', 2)]:
                entry = match_field(structure, {'id': f'p0-b{start+offset}'})[1]
                self.assertIn(owner, entry['owner'].lower())
                self.assertIn(part, entry['question'].lower())

    def test_pmrf_names_addresses_and_dependents_do_not_inherit_other_roles(self):
        structure = inspect_document(FORMS / 'philhealth-pmrf-012020.pdf', 'pmrf')
        keys = {'p0-b4': 'member_last_name', 'p0-b10': 'mother_last_name',
                'p0-b16': 'spouse_last_name', 'p0-b34': 'permanent_unit_room_floor',
                'p0-b52': 'dependent_last_name', 'p0-b60': 'dependent_last_name'}
        for identity, key in keys.items():
            self.assertEqual(match_field(structure, {'id': identity})[1]['key'], key)
        for identity, part in [('p0-b131', 'month'), ('p0-b132', 'day'), ('p0-b133', 'year')]:
            self.assertIn(part, match_field(structure, {'id': identity})[1]['key'])

    def test_aics_verified_scan_label_fixtures_and_staff_protection(self):
        # Transcribed from the visually checked REV03 scan; not a live OCR test.
        structure = {'pages': [{'page': 0, 'text':
            'General Intake Sheet Protective Services Division Crisis Intervention Section',
            'boxes': [
                {'id': 'client', 'text': 'Gitnang Pangalan (Middle Name)',
                 'context': 'IMPORMASYON NG KINATAWAN (Client’s Identifying Information)'},
                {'id': 'beneficiary', 'text': 'Gitnang Pangalan (Middle Name)',
                 'context': 'IMPORMASYON NG BENEPISYARYO (Beneficiary’s Identifying Information)'},
                {'id': 'staff', 'text': 'QN', 'context': 'header above Part I'},
            ]}], 'widgets': []}
        self.assertEqual(match_field(structure, {'id': 'client'})[1]['key'], 'aics_client_middle_name')
        self.assertEqual(match_field(structure, {'id': 'beneficiary'})[1]['key'], 'aics_beneficiary_middle_name')
        text, status, _ = explain_field(structure, {'id': 'staff'})
        self.assertEqual(status, 'completed')
        self.assertIn('Leave this field blank', text)
        self.assertNotIn('Fictional example', text)
        self.assertIsNone(grounded_question(structure, {'id': 'staff'}))


if __name__ == '__main__':
    unittest.main()
