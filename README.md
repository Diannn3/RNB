# PapelLess

PapelLess is a monorepo with a React frontend and a Python API. Each application keeps its own dependency manifest and lockfile; run its commands from that application’s directory where noted.

## Repository layout

- `frontend/` — React, TypeScript and Vite application, imported from [Diannn3/RNB](https://github.com/Diannn3/RNB). See [`frontend/README.md`](frontend/README.md) for frontend workflows.
- `backend/` — FastAPI API, PDF processing and local inference.
- `scripts/`, `tests/`, `skills/` — backend checks, test suite and domain resources.
- `API_CONTRACT.md`, `RUNTIME.md`, `BACKEND_PLAN.md` — backend integration contract, local runtime instructions and implementation plan.

## Install and run locally

### Prerequisites

- Python 3 with `venv` and `pip` available.
- Node.js 22.12+ and npm (Vite also supports Node.js 20.19+).
- For AI-assisted conversations and document processing: a matching local model server. Model files and runtime binaries are not included in the repository; see [`RUNTIME.md`](RUNTIME.md) for the local inference and OCR setup.

The commands below use a Linux/macOS shell and start from the repository root. On Windows, use `py -m venv .venv` and replace `.venv/bin/python` with `.venv\Scripts\python.exe`.

### Backend — terminal 1

Create the virtual environment and install dependencies once:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Start the API from the repository root:

```sh
.venv/bin/python -m backend --model qwen
```

The API listens at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>. Use `--model lfm` instead if running the Liquid model. The flag selects the backend profile; it does **not** start the model server. Start the matching server separately using [`RUNTIME.md`](RUNTIME.md). The default inference URL is `http://127.0.0.1:8081`; override it with `PAPELLESS_LLAMA_URL` if needed.

The API can start without inference: uploads, extracted structure, existing artifact downloads and corpus explanations remain available. AI-dependent operations return an explicit error when inference is unavailable; there is no remote fallback.

### Frontend — terminal 2

In a separate terminal, start from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:5173> (or the URL printed by Vite if that port is occupied). Keep the backend running: Vite forwards same-origin `/api` requests to `127.0.0.1:8000`, so no separate frontend API URL or CORS setup is needed. On subsequent starts, only `npm run dev` is required unless dependencies changed. Stop either server with `Ctrl+C` in its terminal.

### Production frontend build

From `frontend/`:

```sh
npm run build
npm run preview
```

The build writes static assets to `frontend/dist/`; preview serves them locally, normally at <http://127.0.0.1:4173>, and still requires the backend. A production host must provide an equivalent `/api` proxy; the frontend build does not include the API or model server.

### Safety and further documentation

Use synthetic documents only: this local demo has no authentication. Uploaded and generated files persist in the local API. Partial drafts are allowed, but human confirmation is required before PDF-only download. There is no manual/sample workflow, Word export or project restoration.

See [`frontend/README.md`](frontend/README.md) for frontend workflows, [`API_CONTRACT.md`](API_CONTRACT.md) for the integration contract, and [`RUNTIME.md`](RUNTIME.md) for model/OCR setup and authorization boundaries.
