from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from threading import RLock
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import SQLModel, Session, select

import storage as db
import pdf_service as pdf
import inference
from explanations import explain

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
    return (Path(__file__).parent / 'skills' / name / 'SKILL.md').read_text()


def mapping_for(session, workspace_id, document_id, request):
    document = db.resource(session, db.DocumentRecord, document_id)
    if document.workspace_id != workspace_id:
        raise ValueError('document_outside_workspace')
    current = state(workspace_id)
    structure = get_structure(session, document_id)
    if document_id not in current['mappings']:
        db.transition(session, request, 'generating_proposals')
        candidates = inference.map_form(structure, skill('medical-form-assistant'))
        current['mappings'][document_id] = pdf.validate_mapping(structure, candidates)
    return structure, current['mappings'][document_id]


@app.get('/api/v1/documents/{document_id}/structure')
def structure(document_id: str, session: SessionDep):
    with lock:
        return get_structure(session, document_id)


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_max_length=4000)


class DraftInput(Input):
    document_id: str
    values: dict[str, str] = Field(default_factory=dict, max_length=200)


def create_draft(session, workspace_id, document_id, request, supplied):
    structure, mapping = mapping_for(session, workspace_id, document_id, request)
    current = state(workspace_id)
    fields = {f['name']: f for f in mapping['fields']}
    if any(name not in fields or fields[name].get('protected') for name in supplied):
        raise ValueError('unknown_or_protected_field')
    values = dict(current['values'].get(document_id, {}))
    values.update(supplied)
    for name, conflict in current['conflicts'].items():
        if not conflict.get('resolved'):
            values.pop(name, None)
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
