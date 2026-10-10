"""Uploaded-form identity, service isolation, and workspace boundaries."""
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import create_engine

from backend import inference, storage as db
from backend.explanations import explain, search_corpus
from backend.main import app
from tests.test_explanations import answer, lookup, scripted


def test_uploaded_form_explanation():
    source = (Path(__file__).resolve().parents[1] / 'backend/demo_forms'
              / 'dswd-pantawid-data-request.pdf').read_bytes()
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        engine = create_engine(f'sqlite:///{root / "metadata.db"}',
                               connect_args={'check_same_thread': False})
        try:
            with patch.object(db, 'ROOT', root), patch.object(db, 'engine', engine):
                with TestClient(app) as client:
                    workspace = client.post('/api/v1/workspaces').json()['id']
                    prefix = f'/api/v1/workspaces/{workspace}'
                    uploaded = client.post(prefix + '/documents', files={
                        'file': ('sss-e1.pdf', source, 'application/pdf')})
                    assert uploaded.status_code == 201, uploaded.text
                    document = uploaded.json()['document']['id']
                # Structures must also be recovered after a restart.
                with TestClient(app) as client:
                    record = search_corpus('Pantawid Data Request Form')[0]
                    with scripted([lookup('Pantawid Data Request Form'), answer([record['source_id']])]):
                        result = client.post(prefix + '/explanations', json={
                            'query': 'Explain this form', 'document_id': document})
                    assert result.status_code == 200, result.text
                    explanation = result.json()
                    assert set(explanation) == {'request_id', 'assistant_message', 'status', 'citations'}
                    assert explanation['status'] == 'completed'
                    assert explanation['citations'][0]['term'] == record['term']
                    service_record = search_corpus('SSS')[0]
                    with scripted([lookup('SSS'), answer([service_record['source_id']])]) as complete:
                        service = client.post(prefix + '/explanations', json={
                            'query': 'Explain SSS', 'document_id': document}).json()
                        history = json.dumps(complete.call_args.args[0])
                        assert 'name of person making request' not in history.lower()
                    assert service['citations'][0]['feed'] == 'SSS'
                    with patch.object(inference, '_tokens', return_value=10), patch.object(
                            inference, '_complete', side_effect=inference.InferenceError('Unavailable')):
                        unavailable = client.post(prefix + '/explanations', json={'query': 'Explain SSS'})
                    assert unavailable.status_code == 503
                    assert unavailable.json()['detail']['error_code'] == 'inference_unavailable'
                    other = client.post('/api/v1/workspaces').json()['id']
                    with patch.object(inference, 'run_tools', side_effect=AssertionError('Workspace escape')):
                        forbidden = client.post(f'/api/v1/workspaces/{other}/explanations',
                                                json={'query': 'Explain this form',
                                                      'document_id': document})
                    assert forbidden.status_code == 422
                    assert forbidden.json()['detail']['error_code'] == 'processing_failed'
        finally:
            engine.dispose()


def test_generic_form_lookup_requires_complete_evidence():
    with patch.object(inference, 'run_tools', side_effect=AssertionError('No selected form')):
        assert explain('Explain this form')['status'] == 'needs_input'
    record = search_corpus('Pantawid Data Request Form')[0]
    markers = record['document_markers']
    structure = {'pages': [{'text': marker.upper()} for marker in markers]}
    with scripted([lookup('Pantawid Data Request Form'), answer([record['source_id']])]):
        assert explain('Explain this form', structure)['status'] == 'completed'
    for text in ('Unrelated application', 'DSWD Data Request Form',
                 'Pantawid Pamilyang Pilipino Program Data Request Form'):
        structure = {'pages': [{'text': text}], 'filename': 'dswd-pantawid-data-request.pdf'}
        with scripted([lookup('Pantawid'), answer(status='abstained')]):
            result = explain('Explain this form', structure)
        assert result['status'] == 'abstained'
        assert result['citations'] == []
        with scripted([lookup('Pantawid'), answer([record['source_id']]), answer([record['source_id']])]):
            try:
                explain('Explain this form', structure)
            except inference.InferenceError:
                pass
            else:
                raise AssertionError('Partial markers or filenames established form identity')


def test_ambiguous_extracted_forms_require_model_clarification():
    records = [search_corpus(query)[0] for query in ('Pantawid Data Request Form', 'Personal Record E-1')]
    structure = {'pages': [{'text': ' '.join(record['document_markers'])} for record in records]}
    with scripted([lookup('Pantawid'), lookup('Personal Record E-1'), answer(status='needs_input')]):
        result = explain('Explain this form', structure)
    assert result['status'] == 'needs_input'
    assert result['citations'] == []


if __name__ == '__main__':
    test_uploaded_form_explanation()
    test_generic_form_lookup_requires_complete_evidence()
    test_ambiguous_extracted_forms_require_model_clarification()
