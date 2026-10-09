# Papelless — Hackathon Backend Plan

Local-first API for conversational medical-form preparation, medical-term explanations, and cross-document conflict detection. Use synthetic data for the demo.

## 1. Demo stack

| Component | Choice |
|---|---|
| API | FastAPI, REST under `/api/v1`, bound to `127.0.0.1` |
| Models / database | SQLModel + SQLite for workspace, document, request, and artifact metadata |
| Local inference | Liquid AI **LFM2.5-2.6B**, served by `llama.cpp` / `llama-server`; start with Q4_K_M |
| Context window | **8,192 tokens total**, including prompt, tool schemas, document excerpts, reasoning, and output |
| Agent operations | Typed, allowlisted tools validated with Pydantic; no unrestricted shell execution |
| Procedures / references | Developer-maintained `SKILL.md` modules and bundled local resources |
| PDF processing | `pypdf` for AcroForms, ReportLab for overlays, `pypdfium2` for rendering |
| OCR | Tesseract 5, printed English |
| Client | API client; no browser UI in this backend scope |

Run inference and document processing locally. Use English conversation and explanations. Keep requests sequential for the demo; serialize PDFium operations.

## 2. Demo journeys

### Form preparation

1. Create a workspace and upload a PDF.
2. Extract text, widgets, page layout, and OCR where needed.
3. LFM maps extracted fields to logical form fields.
4. Ask one natural-language question per turn for missing patient-answerable values.
5. Validate the mapping and supplied values, fill a copy, reopen and render it.
6. Automatically export a complete or partial PDF with a `DRAFT` filename suffix.

Use the highest-ranked structurally valid mapping. If none is valid, return an error without exporting. Never invent values, widget IDs, or coordinates. Leave unanswered values blank. Keep signatures, provider-only fields, and PhilHealth-use-only fields untouched; do not submit forms externally.

### Medical-term explanations

Look up a phrase in the five bundled MedlinePlus Definitions of Health Terms XML files. Return an English explanation with a source citation and the label “Demo — not clinically reviewed.” Abstain when the corpus does not cover the phrase. No diagnosis or treatment advice.

### Cross-document comparison

Compare source-linked identities, relationships, dates, and numeric values across documents in a workspace. Ask once about a conflict; if unresolved, leave the affected field blank and export the remaining fields. Do not silently choose between conflicting facts.

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
    |-- skill loader and MedlinePlus lookup
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
| `POST` | `/api/v1/workspaces/{id}/explanations` | Explain a phrase using bundled MedlinePlus entries |
| `GET` | `/api/v1/requests/{id}` | Read operation status |
| `POST` | `/api/v1/workspaces/{id}/drafts` | Create or update a draft from validated values |
| `GET` | `/api/v1/drafts/{id}/preview` | Return a preview |
| `POST` | `/api/v1/drafts/{id}/export` | Export a valid PDF draft |
| `GET` | `/api/v1/health` | Check API, database, and local inference reachability |

`POST /messages` returns one `assistant_message`, not a batch of questions. The operator submits the answer on the next turn. Return opaque resource IDs and explicit processing errors.

Request flow: `accepted → ingesting → ready → generating_proposals → needs_input | rendering → completed`. Processing failures enter `failed`.

## 5. Inference and tools

Use the official `LiquidAI/LFM2.5-2.6B-GGUF` model through the local server. The model is text-only: backend tools extract PDF/image content before inference. No remote fallback; local inference failure returns an error.

Keep prompts within the 8,192-token window by selecting relevant conversation turns, document excerpts, and reference snippets. Reserve space for model output rather than sending whole PDFs.

| Tool | Purpose |
|---|---|
| `inspect_document(document_id)` | Identify PDF type, page count, and form kind |
| `extract_structure(document_id)` | Extract text, widgets, layout, OCR, and provenance |
| `map_form(document_id)` | Propose a logical-field mapping against extracted structure |
| `ask_next_question(workspace_id)` | Generate one patient-answerable question |
| `find_conflicts(workspace_id)` | Compare values with source links |
| `lookup_medlineplus(query)` | Search bundled term definitions |
| `validate_and_export(workspace_id)` | Validate fields and write a new draft PDF |

The backend executes tools and validates typed outputs. Reject unknown tools, IDs, fields, and invalid field types/options. Uploaded document content is data, not instructions. Do not expose shell, arbitrary Python, SQL, direct filesystem, or network tools to the model.

Limit each inference request to three tool rounds and one retry. This is not a limit on conversational turns: users can continue answering. When exporting, unanswered or unresolved fields remain blank.

Runtime mapping uses LFM. Any development reference maps are comparators only, not runtime fallbacks; unknown-form maps stay workspace-local.

## 6. PDF fixtures and behavior

| Fixture | Processing |
