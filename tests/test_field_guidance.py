"""Field help must stay sourced, offline, and independent of answer mutation."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import create_engine
from backend import main, storage as db
from backend.explanations import explain
from backend.field_guidance import BANK, grounded_question, match_field
from backend.pdf_service import inspect_document
from backend.explanations import search_corpus
from tests.test_explanations import answer, lookup, scripted

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'backend/demo_forms/dswd-pantawid-data-request.pdf'


class GuidanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.structure = inspect_document(SOURCE, 'test-doc')

    def test_position_and_named_service_are_separate(self):
        field = {'id': 'p0-b1', 'box_id': 'p0-b1', 'protected': False}
        self.assertEqual(grounded_question(self.structure, field), 'What is your current position or role?')
        with patch.object(main.inference, '_complete', side_effect=AssertionError('Must be offline')):
            for query in ['explain', 'Explain this field', 'What should I put here?', 'Explain Position',
                          'Can you explain Position?', 'Could you help me with this field?']:
                result = explain(query, self.structure, field)
                self.assertEqual(result['status'], 'completed')
                self.assertIn('current position', result['assistant_message'])
                self.assertIn('pantawid.dswd.gov.ph', result['citations'][0]['url'])
        for query, term, requested in (
                ('Explain SSS', 'Social Security System', False),
                ('Explain this form', 'Pantawid Data Request Form', False),
                ('Explain SSS', 'Social Security System', True),
                ('Could you explain SSS?', 'Social Security System', True),
                ('Explain this form', 'Pantawid Data Request Form', True)):
            record = next(record for record in search_corpus(term) if record['term'] == term)
            with scripted([lookup(term), answer([record['source_id']])]):
                result = explain(query, self.structure, field, field_requested=requested)
            self.assertEqual(result['citations'][0]['term'], term)

    def test_repeated_contacts_follow_original_section(self):
        person = match_field(self.structure, {'id': 'p0-b5'})[1]
        office = match_field(self.structure, {'id': 'p0-b10'})[1]
        self.assertIn('requester', person['key'])
        self.assertIn('organization', office['key'])
        self.assertNotEqual(person['key'], office['key'])

    def test_missing_context_never_guesses(self):
        self.assertEqual(explain('explain')['status'], 'needs_input')
        self.assertEqual(explain('explain', self.structure, {'id': 'invented'})['status'], 'needs_input')
        unknown = copy.deepcopy(self.structure)
        unknown['pages'][0]['text'] = 'Unrelated application'
        self.assertEqual(explain('explain', unknown, {'id': 'p0-b1'})['status'], 'needs_input')

    def test_bank_provenance_and_protected_fields(self):
        required = {'key', 'label', 'aliases', 'contexts', 'owner', 'meaning', 'input',
                    'format', 'options', 'example', 'question', 'protected', 'basis',
                    'source_page', 'uncertainty'}
        for index in json.loads((BANK / 'index.json').read_text(encoding='utf-8')):
            bank = json.loads((BANK / index['file']).read_text(encoding='utf-8'))
            self.assertEqual(bank['form_id'], index['form_id'])
            self.assertEqual(len({f['key'] for f in bank['fields']}), len(bank['fields']))
            self.assertTrue(bank['url'].startswith('https://'))
            self.assertTrue(any(f['protected'] for f in bank['fields']))
            for field in bank['fields']:
                self.assertTrue(required <= field.keys(), field['key'])
                self.assertGreaterEqual(field['source_page'], 1)
                self.assertNotIn('rect', field)

    def test_help_endpoint_preserves_pending_values_and_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = create_engine(f'sqlite:///{root / "metadata.db"}', connect_args={'check_same_thread': False})
            try:
                with patch.object(db, 'ROOT', root), patch.object(db, 'engine', engine), TestClient(main.app) as client:
                    ws = client.post('/api/v1/workspaces').json()['id']
                    prefix = f'/api/v1/workspaces/{ws}'
                    upload = client.post(prefix + '/documents', files={'file': ('renamed.pdf', SOURCE.read_bytes(), 'application/pdf')})
                    self.assertEqual(upload.status_code, 201)
                    doc = upload.json()['document']['id']
                    current = main.state(ws)
                    field = {'id': 'p0-b1', 'box_id': 'p0-b1', 'protected': False}
                    current.update(active=doc, pending={'id': 'p0-b1'}, mappings={doc: {'fields': [field]}}, values={doc: {'p0-b0': 'Fictional Alex'}})
                    before = copy.deepcopy(current)
                    with patch.object(main.inference, '_complete', side_effect=AssertionError('Must stay offline')):
                        for body in [{'query': 'explain'}, {'query': 'What should I put here?', 'document_id': doc},
                                     {'query': 'Explain this field', 'document_id': doc, 'field_id': 'p0-b1'},
                                     {'query': 'Could you help me with this field?'},
                                     {'query': 'Can you explain Position?', 'document_id': doc}]:
                            result = client.post(prefix + '/explanations', json=body)
                            self.assertEqual(result.status_code, 200, result.text)
                            self.assertEqual(result.json()['status'], 'completed')
                        stale = client.post(prefix + '/explanations', json={'query': 'explain', 'field_id': 'missing'})
                        self.assertEqual(stale.json()['status'], 'needs_input')
                    self.assertEqual(current, before)
                    other = client.post('/api/v1/workspaces').json()['id']
                    denied = client.post(f'/api/v1/workspaces/{other}/explanations', json={'query': 'explain', 'document_id': doc})
                    self.assertEqual(denied.status_code, 422)
            finally:
                engine.dispose()


if __name__ == '__main__':
    unittest.main()
