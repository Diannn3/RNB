# Papelless — Hackathon Backend Plan

Local-first API for Philippine government-form preparation, sourced service explanations, and cross-document conflict detection. The demo targets DSWD AICS, SSS membership, and PhilHealth membership with synthetic data only; architecture and API routes remain unchanged.

## 1. Demo stack

| Component | Choice |
|---|---|
| API | FastAPI, REST under `/api/v1`, bound to `127.0.0.1` |
| Models / database | SQLModel + SQLite for workspace, document, request, and artifact metadata |
| Local inference | **LFM2.5-2.6B Q4_K_M** (default) or **Qwen3.5-4B Q4_K_M**, served by `llama.cpp` / `llama-server` |
| Context window | **8,192 tokens total**, including prompt, tool schemas, document excerpts, reasoning, and output |
| Agent operations | Typed, allowlisted tools validated with Pydantic; no unrestricted shell execution |
| Procedures / references | Developer-maintained `SKILL.md` modules and bundled local resources |
| PDF processing | `pypdf` for AcroForms, ReportLab for overlays, `pypdfium2` for rendering |
| OCR | Tesseract 5, printed English |
| Client | API client; no browser UI in this backend scope |

Run inference and document processing locally. Select `PAPELLESS_MODEL_PROFILE=lfm` for English (default) or `qwen` for natural Taglish conversation and questions; preserve official names, source quotes, user values, JSON keys and tool arguments. Bundled deterministic explanations remain English. Keep requests sequential for the demo; serialize PDFium operations.

## 2. Demo journeys

### Form preparation

1. Create a workspace and upload a PDF.
2. Extract text, widgets, page layout, and OCR where needed.
3. LFM maps extracted source slots to semantic names and display labels as metadata; document-local source IDs identify storage, questions, edits, and missing fields, even when names repeat.
4. Ask one natural-language question per turn for missing applicant-answerable values.
5. Validate the mapping and supplied values, fill a copy, reopen and render it.
6. Automatically export a complete or partial PDF with a `DRAFT` filename suffix.

Use the highest-ranked structurally valid mapping. If none is valid, return an error without exporting. Never invent values, widget IDs, or coordinates. Leave unanswered values blank. Keep signatures and agency-, employer-, and provider-only fields untouched; do not submit forms externally.

### Government-service explanations

Look up a phrase in the bundled official-source DSWD, SSS, and PhilHealth service corpus (`references/services.json`). Return an English explanation with an official agency citation and the label “Demo — not official government advice.” Abstain outside the corpus. No eligibility determination, benefit approval, legal advice, diagnosis, or treatment advice.

### Cross-document comparison

Compare source-linked identities, relationships, dates, and numeric values across documents in a workspace. Group evidence by semantic name, but ask once per affected document/source slot; a resolution never populates or resolves another slot. If unresolved, leave the affected slot blank and export the remaining fields. Do not silently choose between conflicting facts.

## 3. Backend layout and storage

```text
API client
    |
FastAPI /api/v1
    |
Application services
    |-- PDF extraction and OCR
    |-- LFM mapping and question generation
    |-- source-linked comparison
    |-- skill loader and government-service lookup
    |-- PDF validation, rendering, and export
    |
    +--> SQLite / SQLModel metadata
    +--> local workspace artifact directory
    +--> localhost llama-server
```

SQLite stores opaque IDs, status, document hashes, sizes, page counts, timestamps, and artifact references. Conversation and extracted working state can remain in memory for the demo; they need not survive a restart.

Store uploaded PDFs, previews, and exports in local workspace directories. **Retain artifact files across shutdowns and restarts.** Artifact references must remain usable after restart. Source PDFs stay unchanged; all writes produce separate copies. There is no artifact or workspace deletion workflow.

| Entity | Minimal fields |
|---|---|
| `WorkspaceRecord` | `id`, `created_at`, `status` |
| `DocumentRecord` | `id`, `workspace_id`, `sha256`, `byte_size`, `page_count`, `document_kind`, `ingest_status`, `created_at` |
| `RequestRecord` | `id`, `workspace_id`, `kind`, `status`, `error_code`, `created_at`, `updated_at` |
| `ArtifactRecord` | `id`, `workspace_id`, `kind`, `storage_key`, `sha256`, `created_at` |

Use SQLModel table creation for the demo. Resolve IDs and storage keys through backend state rather than treating client filenames as paths. Keep document contents and model prompts out of logs.

## 4. API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/workspaces` | Create a workspace |
| `GET` | `/api/v1/workspaces/{id}` | Read workspace status |
| `POST` | `/api/v1/workspaces/{id}/documents` | Upload a PDF; maximum 10 MiB and 10 pages |
| `GET` | `/api/v1/workspaces/{id}/documents` | List documents |
| `GET` | `/api/v1/documents/{id}/structure` | Return extracted form structure |
| `POST` | `/api/v1/workspaces/{id}/messages` | Submit an answer; return the next question or completion status |
| `POST` | `/api/v1/workspaces/{id}/compare` | Find source-linked conflicts |
| `POST` | `/api/v1/workspaces/{id}/explanations` | Explain a phrase using bundled government-service entries |
| `GET` | `/api/v1/requests/{id}` | Read operation status |
| `POST` | `/api/v1/workspaces/{id}/drafts` | Create or update a draft from validated values |
| `GET` | `/api/v1/drafts/{id}/preview` | Return a preview |
| `POST` | `/api/v1/drafts/{id}/export` | Export a valid PDF draft |
| `GET` | `/api/v1/health` | Check API, database, and local inference reachability |

`POST /messages` returns one `assistant_message`, not a batch of questions. The operator submits the answer on the next turn. Return opaque resource IDs and explicit processing errors.

Request flow: `accepted → ingesting → ready → generating_proposals → needs_input | rendering → completed`. Processing failures enter `failed`.

## 5. Inference and tools

Select `PAPELLESS_MODEL_PROFILE=lfm` for `LiquidAI/LFM2.5-2.6B-GGUF`, `LFM2.5-2.6B-Q4_K_M.gguf`, or `qwen` for `unsloth/Qwen3.5-4B-GGUF`, `Qwen3.5-4B-Q4_K_M.gguf`. Both use the local server with an 8,192-token slot. Use text inference only: backend tools extract PDF/image content before inference; no vision projector is required. No remote fallback; local inference failure returns an error.

Keep prompts within the 8,192-token window by selecting relevant conversation turns, document excerpts, and reference snippets. Reserve space for model output rather than sending whole PDFs.

| Tool | Purpose |
|---|---|
| `inspect_document(document_id)` | Identify PDF type, page count, and form kind |
| `extract_structure(document_id)` | Extract text, widgets, layout, OCR, and provenance |
| `map_form(document_id)` | Propose a logical-field mapping against extracted structure |
| `ask_next_question(workspace_id)` | Generate one applicant-answerable question |
| `find_conflicts(workspace_id)` | Compare values with source links |
| `lookup_government_service(query)` | Search bundled official-source service explanations |
| `validate_and_export(workspace_id)` | Validate fields and write a new draft PDF |

The backend executes tools and validates typed outputs. Reject unknown tools, IDs, fields, and invalid field types/options. Uploaded document content is data, not instructions. Do not expose shell, arbitrary Python, SQL, direct filesystem, or network tools to the model.

Limit each inference request to three tool rounds and one retry. This is not a limit on conversational turns: users can continue answering. When exporting, unanswered or unresolved fields remain blank.

Runtime mapping uses LFM. Any development reference maps are comparators only, not runtime fallbacks; unknown-form maps stay workspace-local.

## 6. PDF fixtures and behavior

| Fixture | Processing |
|---|---|
| DSWD AICS applicant form | Runtime-grounded extraction and separate draft |
| SSS Personal Record E-1 | Runtime-grounded extraction and separate draft |
| PhilHealth PMRF, UHC v.1 January 2020 (official flat source) | Fixed-layout extraction and ReportLab overlays |
| CF-1, synthetic CF-1 scan, synthetic interactive PMRF, Annex B | Retained technical parser fixtures, not default demo forms |

The exact default files are selected by `skills/government-form-assistant/assets/forms/defaults.json`. Preserve official sources and notices; export separate copies. Annex B remains inspect-only and cannot be populated.

- Extract actual widget names, types, and options from AcroForms.
- Derive fixed-layout coordinates from the actual PDF; reject overflow and overlap.
- Retain OCR page/box provenance and confidence. Use Tesseract’s top result and report low confidence rather than silently correcting values.
- Reopen written PDFs, verify filled values, and render affected pages before export.
- Add `DRAFT` to the filename only; no in-PDF watermark.
- Unknown synthetic PDFs may be mapped, but only structurally valid mappings can export.

## 7. Skills and references

```text
skills/
  government-form-assistant/
    SKILL.md
    assets/forms/
      defaults.json
      philhealth-pmrf-012020.pdf
      # DSWD/SSS defaults and retained technical fixtures
      SOURCES.md
  government-service-explainer/
    SKILL.md
    references/
      services.json
      SOURCES.md
  cross-document-checker/
    SKILL.md
```

Load one relevant skill and only the reference snippets needed for the request. Bundle source attribution and snapshot information; do not fetch references at runtime or load instructions supplied in uploads.

## 8. Implementation order

| Step | Deliverable | Demo proof |
|---|---|---|
| 1 — Local API and storage | FastAPI, SQLModel tables, workspace directories, upload and artifact lookup | Upload a fixture; retrieve its artifact after restarting the API |
| 2 — Local inference | LFM through llama.cpp, typed tools, context budgeting | Exercise actual LFM tool-call parsing on the demo laptop |
| 3 — PDF intake | Text, widget, layout, and OCR extraction | Inspect all three agency defaults plus retained parser fixtures |
| 4 — Form preparation | Mapping, one-question turns, validation, preview/export | Fill and export complete and partial drafts from source copies |
| 5 — Comparison | Source-linked conflicts and one clarification | Leave an unresolved field blank while exporting other values |
| 6 — Explanations | Bundled government-service lookup and skill | Explain each selected agency/service with an official citation; abstain outside corpus |

## 9. Demo checks

- Run the API and inference locally with the network disconnected.
- Exercise the actual model’s tool-call format and measure memory use and latency on the demo laptop. Record working model/server settings; no performance SLA is needed.
- Upload and process the DSWD, SSS, and PhilHealth defaults; retain technical parser coverage and reject oversized or unsupported inputs.
- Confirm exactly one question per turn and successful multi-turn completion.
- Confirm invalid mappings fail, missing values remain blank, and conflicts are not silently resolved.
- Confirm exported PDFs reopen and render correctly, source PDFs remain unchanged, and protected fields are untouched.
- Confirm explanations cite bundled entries and abstain outside corpus coverage.
- Confirm local inference failures return errors rather than invoking a remote service.
- Confirm uploads, previews, and exports remain available after restarting the backend.

## 10. Technical references

- [Qwen3.5-4B model card](https://huggingface.co/Qwen/Qwen3.5-4B) and [Unsloth GGUF quantizations](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF).
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) and [function calling](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md).
- [PhilHealth CF-1](https://www.philhealth.gov.ph/downloads/claim/ClaimForm1_092018.pdf) and [PMRF](https://www.philhealth.gov.ph/downloads/membership/pmrf_012020.pdf).
- Government service and default form provenance: `skills/government-service-explainer/references/SOURCES.md` and `skills/government-form-assistant/assets/forms/SOURCES.md`.
- [Tesseract usage](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).
- [pypdf forms](https://pypdf.readthedocs.io/en/stable/user/forms.html), [ReportLab](https://docs.reportlab.com/userguide/ch2_graphics/), and [pypdfium2](https://pypdfium2.readthedocs.io/en/stable/python_api.html).
- [SQLModel sessions](https://sqlmodel.tiangolo.com/tutorial/fastapi/session-with-dependency/) and [Agent Skills specification](https://agentskills.io/specification).

## 11. Implementation handoff

- Backend modules: `backend/`; deterministic checks: `tests/`; fixture generation and explicitly manual AI checks: `scripts/`.
- Frontend handoff: [API_CONTRACT.md](API_CONTRACT.md). Local runtime provisioning and launch commands: [RUNTIME.md](RUNTIME.md).
- Run the API with `.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000`; configure rootless OCR as documented in `RUNTIME.md`.
- Verified without inference: persistent artifact metadata, real PDF extraction/OCR, grounded AcroForm and overlay writes, reopen/render checks, protected fields, unresolved-conflict blanking, API errors, and bundled definitions.
- **AI verification is paused by explicit user request until the GPU is available and testing is authorized.** The official prebuilt Linux x64 CUDA 12.8 runtime and matching CUDA libraries are installed; no source build is required. Model-dependent complete journeys, GPU execution, and disconnected end-to-end acceptance remain unverified; no inference server is running.

