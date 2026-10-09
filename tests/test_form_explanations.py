"""Uploaded-form identity, service isolation, and workspace boundaries."""
from pathlib import Path
import tempfile
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import create_engine

from backend import storage as db
from backend.explanations import explain
from backend.main import app


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
                    result = client.post(prefix + '/explanations', json={
                        'query': 'Explain this form', 'document_id': document})
                    assert result.status_code == 200, result.text
                    explanation = result.json()
                    assert explanation['status'] == 'completed'
                    assert 'Data Request Form' in explanation['citations'][0]['term']
                    service = client.post(prefix + '/explanations', json={
                        'query': 'Explain SSS', 'document_id': document}).json()
                    assert service['citations'][0]['feed'] == 'SSS'
                    other = client.post('/api/v1/workspaces').json()['id']
                    forbidden = client.post(f'/api/v1/workspaces/{other}/explanations',
                                            json={'query': 'Explain this form',
                                                  'document_id': document})
                    assert forbidden.status_code == 422
                    assert forbidden.json()['detail']['error_code'] == 'processing_failed'
        finally:
            engine.dispose()


def test_generic_form_lookup_requires_complete_evidence():
    assert explain('Explain this form')['status'] == 'needs_input'
    for text in ('Unrelated application', 'DSWD Data Request Form',
                 'Pantawid Pamilyang Pilipino Program Data Request Form'):
        result = explain('Explain this form', {'pages': [{'text': text}]})
        assert result['status'] == 'abstained'
        assert result['citations'] == []
    assert explain('Am I eligible for Pantawid?')['status'] == 'abstained'
