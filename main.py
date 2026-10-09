from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlmodel import SQLModel, Session, create_engine

engine = create_engine("sqlite:///./app.db", connect_args={"check_same_thread": False})


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(lifespan=lifespan)


def get_session():
    with Session(engine) as session:
        yield session


@app.get("/health")
def health():
    return {"status": "ok"}
