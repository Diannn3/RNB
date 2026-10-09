# PapelLess

PapelLess is a monorepo with a React frontend and a Python API. Each application keeps its own dependency manifest and lockfile; run its commands from that application’s directory where noted.

## Repository layout

- `frontend/` — React, TypeScript and Vite application, imported from [Diannn3/RNB](https://github.com/Diannn3/RNB). See [`frontend/README.md`](frontend/README.md) for frontend workflows.
- `backend/` — FastAPI API, PDF processing and local inference.
- `scripts/`, `tests/`, `skills/` — backend checks, test suite and domain resources.
- `API_CONTRACT.md`, `RUNTIME.md`, `BACKEND_PLAN.md` — backend integration contract, local runtime instructions and implementation plan.

## Frontend

```sh
cd frontend
npm ci
npm run dev
```

Build and test from `frontend/` with `npm run build` and `npm test`. Browser end-to-end checks are documented in `frontend/README.md`.

## Backend

From the repository root, install Python dependencies into a virtual environment and run the API:

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Run backend tests with `.venv/bin/python -m pytest`. Optional local OCR and inference setup and authorization boundaries are documented in [`RUNTIME.md`](RUNTIME.md).
