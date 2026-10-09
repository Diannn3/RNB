import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from pydantic import field_serializer
from sqlmodel import Field, Session, SQLModel, create_engine


def opaque_id():
    return uuid4().hex


def now():
    return datetime.now(timezone.utc)


class _Record(SQLModel):
    @field_serializer('created_at', 'updated_at', check_fields=False)
    def utc_timestamp(self, value):
        return value.replace(tzinfo=timezone.utc).isoformat()


class WorkspaceRecord(_Record, table=True):
    id: str = Field(default_factory=opaque_id, primary_key=True)
    created_at: datetime = Field(default_factory=now)
    status: str = 'ready'


class DocumentRecord(_Record, table=True):
    id: str = Field(default_factory=opaque_id, primary_key=True)
    workspace_id: str = Field(foreign_key='workspacerecord.id', index=True)
    sha256: str
    byte_size: int
    page_count: int
    document_kind: str
    ingest_status: str = 'ready'
    created_at: datetime = Field(default_factory=now)


class DocumentNameRecord(SQLModel, table=True):
    document_id: str = Field(foreign_key='documentrecord.id', primary_key=True)
    filename: str


class RequestRecord(_Record, table=True):
    id: str = Field(default_factory=opaque_id, primary_key=True)
    workspace_id: str = Field(foreign_key='workspacerecord.id', index=True)
    kind: str
    status: str = 'accepted'
    error_code: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class ArtifactRecord(_Record, table=True):
    id: str = Field(default_factory=opaque_id, primary_key=True)
    workspace_id: str = Field(foreign_key='workspacerecord.id', index=True)
    kind: str
    storage_key: str
    sha256: str
    created_at: datetime = Field(default_factory=now)


ROOT = Path(os.environ.get('PAPELLESS_DATA', 'workspaces')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
engine = create_engine(f'sqlite:///{ROOT / "metadata.db"}',
                       connect_args={'check_same_thread': False})


def get_session():
    with Session(engine, expire_on_commit=False) as session:
        yield session


def resource(session, model, identifier):
    record = session.get(model, identifier)
    if record is None:
        raise HTTPException(404, detail={'error_code': 'not_found'})
    return record


def artifact_path(artifact):
    path = (ROOT / artifact.storage_key).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise HTTPException(404, detail={'error_code': 'artifact_unavailable'})
    if hashlib.sha256(path.read_bytes()).hexdigest() != artifact.sha256:
        raise HTTPException(409, detail={'error_code': 'artifact_modified'})
    return path


def save_artifact(session, workspace_id, kind, content, suffix, identifier=None):
    identifier = identifier or opaque_id()
    directory = ROOT / workspace_id
    directory.mkdir(exist_ok=True)
    path = directory / f'{identifier}{suffix}'
    with path.open('xb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    record = ArtifactRecord(id=identifier, workspace_id=workspace_id, kind=kind,
                            storage_key=str(path.relative_to(ROOT)),
                            sha256=hashlib.sha256(content).hexdigest())
    session.add(record)
    session.commit()
    return record


def transition(session, request, status, error_code=None):
    request.status, request.error_code = status, error_code
    request.updated_at = now()
    session.add(request)
    session.commit()
