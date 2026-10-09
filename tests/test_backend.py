"""Run against real local inference: .venv/bin/python -m tests.test_backend."""
import sys
import io
import os
import socket
import subprocess
import tempfile
import time

import httpx
from pypdf import PdfReader
from reportlab.pdfgen import canvas

with socket.socket() as reservation:
    reservation.bind(('127.0.0.1', 0))
    PORT = reservation.getsockname()[1]
ORIGIN = f'http://127.0.0.1:{PORT}'
BASE = ORIGIN + '/api/v1'


def start(directory):
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn',
        'backend.main:app', '--host', '127.0.0.1', '--port', str(PORT), '--no-access-log'],
        env={**os.environ, 'PAPELLESS_DATA': directory},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError('API exited during startup: ' + process.communicate()[0].decode())
        try:
            if httpx.get(BASE + '/workspaces/missing', timeout=1).status_code == 404:
                return process
        except httpx.ConnectError:
            pass
        time.sleep(0.1)
    process.terminate()
    raise RuntimeError('API startup timed out')


def synthetic_form(patient_name='', birth_date=''):
    output = io.BytesIO()
    c = canvas.Canvas(output)
    c.drawString(50, 780, 'SYNTHETIC patient intake — demo only')
    for name, label, y in [('patient_name', 'Patient name (required)', 700),
                           ('birth_date', 'Date of birth YYYY-MM-DD (required)', 620),
                           ('provider_signature', 'Provider signature — leave untouched', 540)]:
        c.drawString(50, y + 25, label)
        c.acroForm.textfield(name=name, tooltip=label, x=50, y=y, width=280, height=22,
                             fieldFlags='required' if name != 'provider_signature' else '',
                             value={'patient_name': patient_name, 'birth_date': birth_date}.get(name, ''))
    c.save()
    return output.getvalue()


def test_backend():
    with tempfile.TemporaryDirectory() as directory, httpx.Client(timeout=240) as client:
        process = start(directory)
        def post(route, **kwargs):
            response = client.post(BASE + route, **kwargs)
            assert response.is_success, (route, response.status_code, response.text)
            return response.json()
        try:
            workspace = post('/workspaces')['id']
            prefix = f'/workspaces/{workspace}'
            content = synthetic_form()
            uploaded = post(prefix + '/documents', files={'file': ('untrusted.pdf', content, 'application/pdf')})
            document = uploaded['document']['id']
            structure = client.get(BASE + f'/documents/{document}/structure').json()
            assert structure['page_count'] == 1
            protected = [w for w in structure['widgets'] if w['protected']]
            assert any(w['field_name'] == 'provider_signature' for w in protected)
            result = post(prefix + '/messages', json={'document_id': document})
            assert result['status'] == 'needs_input'
            assert result['assistant_message'].count('?') == 1
            partial = post(prefix + '/messages', json={'finalize': True})
            assert partial['status'] == 'completed' and partial['missing_fields']
            response = client.post(ORIGIN + partial['export_url'])
            assert response.is_success
            reader = PdfReader(io.BytesIO(response.content))
            assert all(not f.get('/V') for f in reader.get_fields().values())
            assert client.get(ORIGIN + partial['preview_url']).headers['content-type'] == 'image/png'
            assert client.get(BASE + f'/artifacts/{document}').content == content
            covered = post(prefix + '/explanations', json={'query': 'amino acids'})
            assert covered['status'] == 'completed' and covered['citations'][0]['term'] == 'Amino Acids'
            assert post(prefix + '/explanations', json={'query': 'quantum healing'})['status'] == 'abstained'
            invalid = client.post(BASE + prefix + '/drafts', json={'document_id': document,
                'values': {'provider_signature': 'forbidden'}})
            assert invalid.status_code == 422
            invalid = client.post(BASE + prefix + '/documents', files={'file': ('bad.pdf', b'not a PDF')})
            assert invalid.status_code == 422
            oversized = client.post(BASE + prefix + '/documents', files={'file': ('large.pdf', b'%PDF-' + b'x' * (10 * 1024 * 1024))})
            assert oversized.status_code == 413
            complete_workspace = post('/workspaces')['id']
            complete_prefix = f'/workspaces/{complete_workspace}'
            complete_doc = post(complete_prefix + '/documents',
                files={'file': ('form.pdf', content)})['document']['id']
            turn = post(complete_prefix + '/messages', json={'document_id': complete_doc})
            supplied = []
            for _ in range(10):
                if turn['status'] == 'completed':
                    break
                assert turn['status'] == 'needs_input' and turn['assistant_message'].count('?') == 1
                value = '2000-01-02' if 'birth' in turn['field'] or 'date' in turn['field'] else 'Synthetic Ada'
                supplied.append(value)
                turn = post(complete_prefix + '/messages', json={'answer': value})
            assert turn['status'] == 'completed' and not turn['missing_fields']
            filled = PdfReader(io.BytesIO(client.post(ORIGIN + turn['export_url']).content)).get_fields()
            assert {str(f.get('/V')) for f in filled.values() if f.get('/V')} == set(supplied)
            assert not filled['provider_signature'].get('/V')
            conflict_workspace = post('/workspaces')['id']
            conflict_prefix = f'/workspaces/{conflict_workspace}'
            conflict_docs = []
            for name in ('Synthetic Ada', 'Synthetic Bea'):
                upload_result = post(conflict_prefix + '/documents',
                    files={'file': ('source.pdf', synthetic_form(name, '2000-01-02'))})
                conflict_docs.append(upload_result['document']['id'])
            comparison = post(conflict_prefix + '/compare')
            conflicts = [c for c in comparison['comparisons'] if c['outcome'] == 'conflict']
            assert any({s['value'] for s in c['sources']} == {'Synthetic Ada', 'Synthetic Bea'} for c in conflicts)
            question = post(conflict_prefix + '/messages', json={'document_id': conflict_docs[0]})
            assert question['status'] == 'needs_input' and question.get('conflict')
            result = post(conflict_prefix + '/messages', json={'skip': True})
            if result['status'] == 'needs_input':
                result = post(conflict_prefix + '/messages', json={'answer': '2000-01-02'})
            assert result['status'] == 'completed'
            conflict_pdf = PdfReader(io.BytesIO(client.post(ORIGIN + result['export_url']).content)).get_fields()
            assert not conflict_pdf['patient_name'].get('/V')
            assert conflict_pdf['birth_date'].get('/V') == '2000-01-02'
            process.terminate()
            process.wait(timeout=10)
            process = start(directory)
            assert client.get(BASE + f'/artifacts/{document}').content == content
            assert client.get(ORIGIN + partial['preview_url']).status_code == 200
            assert client.post(ORIGIN + partial['export_url']).content == response.content
            assert client.get(BASE + f'/requests/{partial["request_id"]}').json()['status'] == 'completed'
            print('Actual local model: complete/partial turns, conflict blanks, protection, errors, citations, restart persistence verified.')
        finally:
            process.terminate()
            process.wait(timeout=10)


if __name__ == '__main__':
    test_backend()
