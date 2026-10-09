"""Storage and conflict/export behavior using real PDFs, with inference forbidden."""
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas
from sqlmodel import create_engine

from backend import inference, pdf_service as pdf, storage as db
from backend.main import app, state
from tests.test_pdf_service import field_for


class ApiBehavior(unittest.TestCase):
    def test_persistent_artifacts_and_unresolved_conflict_export(self):
        stream = io.BytesIO()
        canvas = Canvas(stream)
        for name, value, y in [('patient_name', 'Synthetic Ada', 700),
                               ('birth_date', '2000-01-02', 620),
                               ('provider_signature', 'Original provider data', 540)]:
            canvas.drawString(50, y + 25, name)
            canvas.acroForm.textfield(name=name, value=value, x=50, y=y, width=280, height=22)
        canvas.save()
        source = stream.getvalue()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = create_engine(f'sqlite:///{root / "metadata.db"}',
                                   connect_args={'check_same_thread': False})
            with patch.object(db, 'ROOT', root), patch.object(db, 'engine', engine), patch.object(
                    inference, '_request', side_effect=AssertionError('Inference forbidden in this check')):
                with TestClient(app) as client:
                    workspace_response = client.post('/api/v1/workspaces')
                    self.assertEqual(workspace_response.status_code, 201)
                    workspace = workspace_response.json()['id']
                    self.assertTrue(workspace_response.json()['created_at'].endswith('+00:00'))
                    prefix = f'/api/v1/workspaces/{workspace}'
                    response = client.post(prefix + '/documents', files={'file': ('../../outside.pdf', source)})
                    self.assertEqual(response.status_code, 201)
                    upload = response.json()
                    document = upload['document']['id']
                    self.assertEqual(upload['document']['sha256'], hashlib.sha256(source).hexdigest())
                    self.assertEqual(client.get(f'/api/v1/artifacts/{document}').content, source)
                    structure = client.get(f'/api/v1/documents/{document}/structure').json()
                    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(source)))
                    writer.update_page_form_field_values(None, {'patient_name': 'Synthetic Bea'}, auto_regenerate=False)
                    second = io.BytesIO()
                    writer.write(second)
                    other = client.post(prefix + '/documents', files={'file': ('other.pdf', second.getvalue())}).json()['document']['id']
                    other_structure = client.get(f'/api/v1/documents/{other}/structure').json()
                    evidence = []
                    for source_structure in (structure, other_structure):
                        widget = next(w for w in source_structure['widgets'] if w['field_name'] == 'patient_name')
                        evidence.append({'name': 'patient_name', 'document_id': source_structure['document_id'],
                            'widget_id': widget['id'], 'page': widget['page'], 'value': widget['value'], 'confidence': None})
                    self.assertEqual({e['value'] for e in evidence}, {'Synthetic Ada', 'Synthetic Bea'})
                    self.assertEqual(client.post(prefix + '/messages', json={'skip': 'yes'}).status_code, 422)
                    fields = [{**field_for(widget, True), 'name': widget['field_name']}
                              for widget in structure['widgets']]
                    current = state(workspace)
                    current['mappings'][document] = pdf.validate_mapping(structure, [{'rank': 1, 'fields': fields}])
                    current['values'][document] = {'birth_date': '2000-01-02'}
                    current['conflicts']['patient_name'] = {'name': 'patient_name',
                        'sources': evidence,
                        'asked': False, 'resolved': False}
                    turn = client.post(prefix + '/messages', json={'document_id': document}).json()
                    self.assertEqual(turn['status'], 'needs_input')
                    self.assertEqual(turn['field'], 'patient_name')
                    result = client.post(prefix + '/messages', json={'finalize': True}).json()
                    self.assertEqual(result['status'], 'completed')
                    self.assertIn('patient_name', result['missing_fields'])
                    exported = client.post(result['export_url'])
                    self.assertEqual(exported.status_code, 200)
                    values = PdfReader(io.BytesIO(exported.content)).get_fields()
                    self.assertFalse(values['patient_name'].get('/V'))
                    self.assertEqual(values['birth_date']['/V'], '2000-01-02')
                    self.assertEqual(values['provider_signature']['/V'], 'Original provider data')
                    self.assertEqual(client.get(f'/api/v1/artifacts/{document}').content, source)
                    self.assertEqual(client.get(result['preview_url']).headers['content-type'], 'image/png')
                    again = client.post(prefix + '/messages', json={}).json()
                    self.assertEqual(again['status'], 'completed')
                    self.assertNotIn('conflict', again)
                    invalid = client.post(prefix + '/drafts', json={'document_id': document,
                        'values': {'provider_signature': 'Forbidden'}})
                    self.assertEqual(invalid.status_code, 422)
                    request_id = invalid.json()['detail']['request_id']
                    self.assertEqual(client.get(f'/api/v1/requests/{request_id}').json()['status'], 'failed')
                    self.assertEqual(client.post(prefix + '/documents', files={'file': ('bad.pdf', b'bad')}).status_code, 422)
                    covered = client.post(prefix + '/explanations', json={'query': 'DSWD AICS'}).json()
                    self.assertEqual(covered['status'], 'completed')
                    self.assertEqual(covered['citations'][0]['feed'], 'DSWD')
                    self.assertEqual(client.post(prefix + '/explanations', json={'query': 'quantum healing'}).json()['status'], 'abstained')
                with TestClient(app) as restarted:
                    self.assertEqual(restarted.get(f'/api/v1/artifacts/{document}').content, source)
                    self.assertEqual(restarted.post(result['export_url']).content, exported.content)
                    self.assertEqual(restarted.get(result['preview_url']).headers['content-type'], 'image/png')
                    self.assertEqual(restarted.get(f'/api/v1/requests/{result["request_id"]}').json()['status'], 'completed')
            engine.dispose()


if __name__ == '__main__':
    unittest.main()
