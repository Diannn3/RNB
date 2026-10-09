from contextlib import asynccontextmanager, contextmanager
import hashlib
import json
from pathlib import Path
from threading import RLock
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import SQLModel, Session, select

from . import storage as db
from . import pdf_service as pdf
from . import inference
from .explanations import explain

# ponytail: sequential demo; per-workspace locks if concurrent throughput matters.
lock = RLock()
working = {}
SessionDep = Annotated[Session, Depends(db.get_session)]


@asynccontextmanager
async def lifespan(app):
    SQLModel.metadata.create_all(db.engine)
    yield
    working.clear()


app = FastAPI(lifespan=lifespan)


def state(workspace_id):
    return working.setdefault(workspace_id, {'structures': {}, 'mappings': {},
        'values': {}, 'conflicts': {}, 'pending': None, 'active': None})


@contextmanager
def operation(session, workspace_id, kind):
    request = db.RequestRecord(workspace_id=workspace_id, kind=kind)
    session.add(request)
    session.commit()
    try:
        yield request
    except HTTPException as error:
        code = error.detail.get('error_code', 'processing_failed')
        db.transition(session, request, 'failed', code)
        error.detail['request_id'] = request.id
        raise
    except (ValueError, RuntimeError, OSError) as error:
        code = 'inference_unavailable' if isinstance(error, RuntimeError) else 'processing_failed'
        db.transition(session, request, 'failed', code)
        raise HTTPException(422 if isinstance(error, ValueError) else 503,
            detail={'error_code': code, 'request_id': request.id}) from None

@app.post('/api/v1/workspaces', status_code=201)
def create_workspace(session: SessionDep):
    record = db.WorkspaceRecord()
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@app.get('/api/v1/workspaces/{workspace_id}')
def workspace(workspace_id: str, session: SessionDep):
    return db.resource(session, db.WorkspaceRecord, workspace_id)


@app.get('/api/v1/workspaces/{workspace_id}/documents')
def documents(workspace_id: str, session: SessionDep):
    db.resource(session, db.WorkspaceRecord, workspace_id)
    return session.exec(select(db.DocumentRecord).where(
        db.DocumentRecord.workspace_id == workspace_id)).all()


@app.post('/api/v1/workspaces/{workspace_id}/documents', status_code=201)
def upload(workspace_id: str, session: SessionDep, file: UploadFile = File(...)):
    db.resource(session, db.WorkspaceRecord, workspace_id)
    with lock, operation(session, workspace_id, 'ingest') as request:
        db.transition(session, request, 'ingesting')
        content = file.file.read(10 * 1024 * 1024 + 1)
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(413, detail={'error_code': 'upload_too_large'})
        if not content.startswith(b'%PDF-'):
            raise ValueError('unsupported_pdf')
        identifier = db.opaque_id()
        directory = db.ROOT / workspace_id
        directory.mkdir(exist_ok=True)
        temporary = directory / f'{identifier}.intake'
        try:
            temporary.write_bytes(content)
            structure = pdf.inspect_document(temporary, identifier)
            artifact = db.save_artifact(session, workspace_id, 'upload', content,
                                        '.pdf', identifier)
        finally:
            temporary.unlink(missing_ok=True)
        document = db.DocumentRecord(id=identifier, workspace_id=workspace_id,
            sha256=artifact.sha256, byte_size=len(content),
            page_count=structure['page_count'], document_kind=structure['document_kind'])
        session.add(document)
        session.commit()
        state(workspace_id)['structures'][identifier] = structure
        db.transition(session, request, 'ready')
        return {'document': document, 'artifact_id': identifier, 'request_id': request.id}


@app.get('/api/v1/artifacts/{artifact_id}')
def artifact(artifact_id: str, session: SessionDep):
    record = db.resource(session, db.ArtifactRecord, artifact_id)
    return FileResponse(db.artifact_path(record))


@app.get('/api/v1/requests/{request_id}')
def request_status(request_id: str, session: SessionDep):
    return db.resource(session, db.RequestRecord, request_id)


def get_structure(session, document_id):
    document = db.resource(session, db.DocumentRecord, document_id)
    current = state(document.workspace_id)
    if document_id not in current['structures']:
        source = db.resource(session, db.ArtifactRecord, document_id)
        current['structures'][document_id] = pdf.inspect_document(
            db.artifact_path(source), document_id)
    return current['structures'][document_id]


def skill(name):
    return (Path(__file__).parent.parent / 'skills' / name / 'SKILL.md').read_text()


def mapping_for(session, workspace_id, document_id, request):
    document = db.resource(session, db.DocumentRecord, document_id)
    if document.workspace_id != workspace_id:
        raise ValueError('document_outside_workspace')
    current = state(workspace_id)
    structure = get_structure(session, document_id)
    if document_id not in current['mappings']:
        # Caching for live demo purposes: only the byte-identical bundled DSWD form.
        bundled = (Path(__file__).parent.parent / 'skills/government-form-assistant'
                   / 'assets/forms/dswd-aics-general-intake-sheet.pdf')
        cache = db.ROOT / f'dswd-mapping-{document.sha256}.json'
        demo_form = document.sha256 == hashlib.sha256(bundled.read_bytes()).hexdigest()
        mapping = None
        if demo_form and cache.is_file():
            try:
                mapping = pdf.validate_mapping(structure, [json.loads(cache.read_text())])
            except (ValueError, OSError):
                pass
        if mapping is None:
            db.transition(session, request, 'generating_proposals')
            candidates = inference.map_form(structure, skill('government-form-assistant'))
            mapping = pdf.validate_mapping(structure, candidates)
            if demo_form:
                temporary = cache.with_suffix('.tmp')
                temporary.write_text(json.dumps(mapping))
                temporary.replace(cache)
        current['mappings'][document_id] = mapping
    return structure, current['mappings'][document_id]


@app.get('/api/v1/documents/{document_id}/structure')
def structure(document_id: str, session: SessionDep):
    with lock:
        try:
            return get_structure(session, document_id)
        except (ValueError, OSError):
            raise HTTPException(422, detail={'error_code': 'processing_failed'}) from None


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, str_max_length=4000)


class DraftInput(Input):
    document_id: str
    values: dict[str, str] = Field(default_factory=dict, max_length=200)


def create_draft(session, workspace_id, document_id, request, supplied):
    structure, mapping = mapping_for(session, workspace_id, document_id, request)
    current = state(workspace_id)
    fields = {f['id']: f for f in mapping['fields']}
    if any(identity not in fields or fields[identity].get('protected') for identity in supplied):
        raise ValueError('unknown_or_protected_field')
    values = dict(current['values'].get(document_id, {}))
    values.update(supplied)
    for identity, field in fields.items():
        conflict = current['conflicts'].get(field['name'])
        if conflict and (document_id, identity) not in conflict.get('resolutions', {}):
            values.pop(identity, None)
    db.transition(session, request, 'rendering')
    source = db.resource(session, db.ArtifactRecord, document_id)
    temporary = db.ROOT / workspace_id / f'{db.opaque_id()}.draft'
    preview = temporary.with_suffix('.png')
    try:
        pdf.export_pdf(db.artifact_path(source), temporary, structure, mapping, values)
        pdf.render_preview(temporary, preview)
        draft = db.save_artifact(session, workspace_id, 'draft', temporary.read_bytes(), '-DRAFT.pdf')
        db.save_artifact(session, workspace_id, f'preview:{draft.id}', preview.read_bytes(), '.png')
    finally:
        temporary.unlink(missing_ok=True)
        preview.unlink(missing_ok=True)
    current['values'][document_id] = values
    missing = [name for name, field in fields.items()
               if not field.get('protected') and not values.get(name)]
    db.transition(session, request, 'completed')
    return {'request_id': request.id, 'status': 'completed', 'draft_id': draft.id,
        'preview_url': f'/api/v1/drafts/{draft.id}/preview',
        'export_url': f'/api/v1/drafts/{draft.id}/export', 'missing_fields': missing}


@app.post('/api/v1/workspaces/{workspace_id}/drafts', status_code=201)
def drafts(workspace_id: str, body: DraftInput, session: SessionDep):
    db.resource(session, db.WorkspaceRecord, workspace_id)
    with lock, operation(session, workspace_id, 'draft') as request:
        return create_draft(session, workspace_id, body.document_id, request, body.values)


def draft_record(session, draft_id):
    record = db.resource(session, db.ArtifactRecord, draft_id)
    if record.kind != 'draft':
        raise HTTPException(404, detail={'error_code': 'not_found'})
    return record


@app.get('/api/v1/drafts/{draft_id}/preview')
def preview(draft_id: str, session: SessionDep):
    draft_record(session, draft_id)
    record = session.exec(select(db.ArtifactRecord).where(
        db.ArtifactRecord.kind == f'preview:{draft_id}')).first()
    if record is None:
        raise HTTPException(404, detail={'error_code': 'artifact_unavailable'})
    return FileResponse(db.artifact_path(record), media_type='image/png')


@app.post('/api/v1/drafts/{draft_id}/export')
def export(draft_id: str, session: SessionDep):
    record = draft_record(session, draft_id)
    return FileResponse(db.artifact_path(record), media_type='application/pdf',
                        filename=f'{draft_id}-DRAFT.pdf')


class MessageInput(Input):
    document_id: str | None = None
    answer: str | None = None
    skip: bool = False
    finalize: bool = False


@app.post('/api/v1/workspaces/{workspace_id}/messages')
def messages(workspace_id: str, body: MessageInput, session: SessionDep):
    db.resource(session, db.WorkspaceRecord, workspace_id)
    with lock, operation(session, workspace_id, 'message') as request:
        current = state(workspace_id)
        document_id = body.document_id or current['active']
        if not document_id:
            raise ValueError('document_id_required')
        if current['pending'] and current['active'] != document_id:
            raise ValueError('answer_pending_for_another_document')
        structure, mapping = mapping_for(session, workspace_id, document_id, request)
        current['active'] = document_id
        values = current['values'].setdefault(document_id, {})
        pending = current['pending']
        if body.answer is not None and (body.skip or body.finalize):
            raise ValueError('answer_and_skip_or_finalize')
        if body.answer is not None and pending is None:
            raise ValueError('no_pending_question')
        if pending and (body.answer is not None or body.skip or body.finalize):
            identity = pending['id']
            if body.answer and body.answer.strip():
                values[identity] = body.answer
                if pending['kind'] == 'conflict':
                    conflict = current['conflicts'][pending['conflict_name']]
                    conflict.setdefault('resolutions', {})[(document_id, identity)] = body.answer
            else:
                values.pop(identity, None)
            current.setdefault('answered', {}).setdefault(document_id, set()).add(identity)
            current['pending'] = None
        if body.finalize:
            result = create_draft(session, workspace_id, document_id, request, {})
            result['assistant_message'] = 'The partial draft is ready. Unanswered or unresolved fields remain blank.'
            return result
        if current['pending']:
            db.transition(session, request, 'needs_input')
            return {'request_id': request.id, 'status': 'needs_input',
                    **current['pending']['response']}
        fields = {f['id']: f for f in mapping['fields'] if not f.get('protected')}
        answered = current.setdefault('answered', {}).setdefault(document_id, set())
        for identity, field in fields.items():
            conflict = current['conflicts'].get(field['name'])
            slot = (document_id, identity)
            if conflict and slot not in conflict.get('resolutions', {}):
                asked = conflict.setdefault('asked_slots', set())
                if slot in asked:
                    continue
                asked.add(slot)
                response = {'assistant_message': f"Which value should this draft use for {field['label']}? You may skip to leave it blank.",
                            'field': identity, 'name': field['name'], 'label': field['label'],
                            'conflict': {'name': field['name'], 'sources': conflict['sources'],
                                         'asked': True, 'resolved': False}}
                current['pending'] = {'kind': 'conflict', 'id': identity,
                                      'conflict_name': field['name'], 'response': response}
                db.transition(session, request, 'needs_input')
                return {'request_id': request.id, 'status': 'needs_input', **response}
        for identity, field in fields.items():
            conflict = current['conflicts'].get(field['name'])
            if conflict and (document_id, identity) not in conflict.get('resolutions', {}):
                continue
            if not values.get(identity) and identity not in answered:
                question = inference.ask_question(field, skill('government-form-assistant'))
                response = {'assistant_message': question, 'field': identity,
                            'name': field['name'], 'label': field['label']}
                current['pending'] = {'kind': 'field', 'id': identity, 'response': response}
                db.transition(session, request, 'needs_input')
                return {'request_id': request.id, 'status': 'needs_input', **response}
        result = create_draft(session, workspace_id, document_id, request, {})
        result['assistant_message'] = 'The draft is ready. Unanswered or unresolved fields remain blank.'
        return result


def source_facts(structure):
    proposed = inference.extract_facts(structure, skill('cross-document-checker'))
    widgets = {w['id']: w for w in structure['widgets']}
    boxes = {b['id']: (p['page'], b) for p in structure['pages'] for b in p['boxes']}
    facts = []
    for fact in proposed:
        if fact.get('document_id') != structure['document_id']:
            raise ValueError('invalid_fact_document')
        if fact.get('widget_id') in widgets:
            source = widgets[fact['widget_id']]
            text, page = str(source.get('value') or ''), source['page']
            confidence = None
        elif fact.get('box_id') in boxes:
            page, source = boxes[fact['box_id']]
            text, confidence = source['text'], source.get('confidence')
        else:
            raise ValueError('invalid_fact_source')
        if fact.get('page') != page or not fact.get('value') or str(fact['value']) not in text:
            raise ValueError('unsupported_fact_value')
        facts.append({**fact, 'confidence': confidence})
    return facts


@app.post('/api/v1/workspaces/{workspace_id}/compare')
def compare(workspace_id: str, session: SessionDep):
    db.resource(session, db.WorkspaceRecord, workspace_id)
    with lock, operation(session, workspace_id, 'compare') as request:
        db.transition(session, request, 'generating_proposals')
        grouped = {}
        for document in documents(workspace_id, session):
            for fact in source_facts(get_structure(session, document.id)):
                grouped.setdefault(fact['name'], []).append(fact)
        current = state(workspace_id)
        results = []
        for name, facts in grouped.items():
            outcome = 'insufficient_evidence'
            if len({f['document_id'] for f in facts}) > 1:
                outcome = 'conflict' if len({str(f['value']) for f in facts}) > 1 else 'agreement'
            results.append({'name': name, 'outcome': outcome, 'sources': facts})
            if outcome == 'conflict':
                previous = current['conflicts'].get(name, {})
                if previous.get('sources') != facts:
                    current['conflicts'][name] = {'name': name, 'sources': facts,
                                                  'asked_slots': set(), 'resolutions': {}}
        db.transition(session, request, 'completed')
        return {'request_id': request.id, 'status': 'completed', 'comparisons': results}


class ExplanationInput(Input):
    query: str = Field(min_length=1, max_length=500)
    document_id: str | None = Field(default=None, min_length=1, max_length=100)


@app.post('/api/v1/workspaces/{workspace_id}/explanations')
def explanations(workspace_id: str, body: ExplanationInput, session: SessionDep):
    db.resource(session, db.WorkspaceRecord, workspace_id)
    with lock, operation(session, workspace_id, 'explanation') as request:
        structure = None
        if body.document_id is not None:
            document = db.resource(session, db.DocumentRecord, body.document_id)
            if document.workspace_id != workspace_id:
                raise ValueError('document_outside_workspace')
            structure = get_structure(session, body.document_id)
        result = explain(body.query, structure)
        db.transition(session, request, 'completed')
        return {'request_id': request.id, **result}


@app.get('/api/v1/health')
def health(session: SessionDep):
    session.exec(select(db.WorkspaceRecord).limit(1)).all()
    local = inference.health()
    return {'api': 'ok', 'database': 'ok', 'inference': local}
