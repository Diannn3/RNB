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
