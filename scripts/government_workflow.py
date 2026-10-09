"""Synthetic DSWD/SSS scenario shared by the CUDA conversation check."""
import hashlib
import io

import pypdfium2 as pdfium
from PIL import ImageChops
from pypdf import PdfReader

from scripts.check_backend import BASE, ORIGIN


def render_pdf(content, page_index=0):
    with pdfium.PdfDocument(content) as document:
        page = document[page_index]
        try:
            bitmap = page.render(scale=2)
            try:
                return bitmap.to_pil().copy()
            finally:
                bitmap.close()
        finally:
            page.close()


def check_forms(forms, defaults, client, post):
    for selected in defaults:
        source = forms / selected['path']
        original = source.read_bytes()
        original_hash = hashlib.sha256(original).hexdigest()
        workspace = post('/workspaces')['id']
        prefix = f'/workspaces/{workspace}'
        explanation = post(prefix + '/explanations', json={'query': selected['agency']})
        assert explanation['status'] == 'completed', explanation
        assert explanation['citations'][0]['feed'] == selected['agency']
        document = post(prefix + '/documents', files={
            'file': (source.name, original, 'application/pdf')})['document']['id']
        print(f"Uploaded {selected['agency']} {selected['service']}; synthetic answers only.", flush=True)
        structure = client.get(BASE + f'/documents/{document}/structure')
        structure.raise_for_status()
        structure = structure.json()
        targets = {w['id']: w for w in structure['widgets']}
        targets.update({b['id']: b for p in structure['pages'] for b in p['boxes']})
        turn = post(prefix + '/messages', json={'document_id': document})
        supplied, seen = set(), set()
        for _ in range(300):
            print('Assistant:', turn['assistant_message'], flush=True)
            if turn['status'] == 'completed':
                break
            assert turn['status'] == 'needs_input', turn
            if len(supplied) >= 3:
                print('Applicant: Finish a partial draft; leave other fields blank.', flush=True)
                turn = post(prefix + '/messages', json={'finalize': True})
                continue
            field = turn['field']
            assert field not in seen, f'Repeated question for {field}'
            seen.add(field)
            answer = None
            label = turn['label'].lower().replace(' ', '_')
            name = turn['name'] + ' ' + label
            if 'last_name' in name or 'surname' in name:
                answer = 'EXAMPLE'
            elif 'first_name' in name or 'given_name' in name:
                answer = 'ADA'
            elif 'middle_name' in name:
                answer = 'DEMO'
            elif turn['name'] in {'applicant_name', 'member_name', 'full_name', 'name'} or label in {
                    'applicant_name', 'member_name', 'full_name', 'name'}:
                answer = 'ADA DEMO EXAMPLE'
            elif 'email' in name:
                answer = 'ada@example.invalid'
            if targets[field]['type'] != 'text':
                answer = None
            if answer:
                supplied.add(answer)
                print('Applicant:', answer, flush=True)
                turn = post(prefix + '/messages', json={'answer': answer})
            else:
                print(f'Applicant: Skip {field}; no synthetic answer supplied.', flush=True)
                turn = post(prefix + '/messages', json={'skip': True})
        assert turn['status'] == 'completed', turn
        assert supplied, f"No synthetic applicant name/contact answer mapped for {selected['agency']}"
        export = client.post(ORIGIN + turn['export_url'])
        export.raise_for_status()
        reader = PdfReader(io.BytesIO(export.content))
        assert len(reader.pages) == structure['page_count']
        text = ''.join(page.extract_text() for page in reader.pages)
        for value in supplied:
            assert value.upper() in text.upper(), f'Missing exported value: {value}'
        assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
        for page_index, page in enumerate(structure['pages']):
            before_image = render_pdf(original, page_index)
            after_image = render_pdf(export.content, page_index)
            try:
                assert before_image.size == after_image.size
                height = page['height']
                for x0, y0, x1, y1 in page['protected_regions']:
                    crop = (round(x0 * 2), round((height - y1) * 2),
                            round(x1 * 2), round((height - y0) * 2))
                    assert ImageChops.difference(before_image.crop(crop),
                                                after_image.crop(crop)).getbbox() is None, (
                        'Protected agency/signature region changed', crop)
            finally:
                before_image.close()
                after_image.close()
        assert 'DRAFT.pdf' in export.headers['content-disposition']
        preview = client.get(ORIGIN + turn['preview_url'])
        preview.raise_for_status()
        assert preview.headers['content-type'] == 'image/png'
        assert preview.content.startswith(b'\x89PNG\r\n\x1a\n')
        print(f"PASS: {selected['agency']} real-model conversation, sourced explanation, "
              "synthetic values in PDF, unchanged source/protected regions, preview and DRAFT.",
              flush=True)
