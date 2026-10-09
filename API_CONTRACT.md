# Frontend API contract

## Connection and state

The demo is a localhost-only REST API under `/api/v1`; use the server's configured `127.0.0.1` address. It has no authentication and no browser UI. Use synthetic data only. Send JSON with `Content-Type: application/json`, except PDF upload (`multipart/form-data`). IDs are opaque strings: store and return them unchanged. Timestamps are UTC ISO-8601 strings.

SQLite resource metadata and uploaded, preview, and exported artifact files persist across restarts. Conversation progress (active/pending question, answers, mappings, and conflict state) is working memory and is lost on restart. After restart, send `document_id` to start a new conversation; uploaded documents and artifact URLs remain available. There is no delete endpoint.

For a browser frontend on another port, use a same-origin development proxy; the API does not enable cross-origin CORS. Local AI form mapping and question/answer completion were verified after explicit authorization. The full manual journey still fails during cross-document fact extraction; ungrounded values are rejected. Model-dependent mapping, questions, comparison, and explanations require the local inference server and return explicit errors when it is unavailable. Uploads, extracted structure, and saved artifact downloads do not require inference.

## Endpoints

All paths below are relative to `/api/v1`.

| Method and path | Request | Success response |
|---|---|---|
| `POST /workspaces` | No body | `201` workspace object |
| `GET /workspaces/{workspace_id}` | — | `200` workspace object |
| `POST /workspaces/{workspace_id}/documents` | Multipart field `file`; PDF, at most 10 MiB and 10 pages | `201` `{document, artifact_id, request_id}` |
| `GET /workspaces/{workspace_id}/documents` | — | `200` array of document objects |
| `GET /documents` | — | `200` all persisted uploaded document objects, newest first; used by the filename reopen dropdown |
| `GET /documents/{document_id}/structure` | — | `200` extracted structure object |
| `POST /workspaces/{workspace_id}/messages` | JSON message body below | `200` needs-input or completed message object |
| `POST /workspaces/{workspace_id}/compare` | No body | `200` comparison result |
| `POST /workspaces/{workspace_id}/explanations` | `{"query":"...","document_id":"optional-selected-document"}` | `200` explanation result |
| `GET /requests/{request_id}` | — | `200` request object |
| `POST /workspaces/{workspace_id}/drafts` | JSON draft body below | `201` completed draft object |
| `GET /drafts/{draft_id}/preview` | — | `200` PNG bytes (`image/png`) |
| `POST /drafts/{draft_id}/export` | No body | `200` PDF bytes; attachment filename `{draft_id}-DRAFT.pdf` |
| `GET /artifacts/{artifact_id}` | — | `200` persisted artifact bytes (PDF for uploaded and exported documents) |
| `GET /health` | — | `200` API, database, and inference status |

## JSON resources

Workspace:

```json
{"id":"opaque-id","created_at":"2026-10-09T12:00:00Z","status":"ready"}
```

Document (also nested as `document` in the upload response):

```json
{"id":"opaque-id","workspace_id":"opaque-id","filename":"example.pdf","sha256":"<64 lowercase hex characters>","byte_size":12345,"page_count":2,"document_kind":"cf1","ingest_status":"ready","created_at":"2026-10-09T12:00:00Z"}
```

`document_kind` is one of `cf1`, `pmrf`, `annex_b`, `acroform`, or `fixed_layout`. The uploaded PDF's `artifact_id` equals `document.id`; download it with `GET /artifacts/{artifact_id}`.

`filename` is persisted for new uploads, trimmed to the basename and at most 255 characters. Older records return `null`; the original filename was not stored and is not inferred. Names live in a separate metadata table created at startup, so existing document rows and artifacts need no migration. Restart the API to load this schema and the listing endpoint.

Request status:

```json
{"id":"opaque-id","workspace_id":"opaque-id","kind":"message","status":"needs_input","error_code":null,"created_at":"2026-10-09T12:00:00Z","updated_at":"2026-10-09T12:00:01Z"}
```

`kind` identifies the operation (`ingest`, `message`, `compare`, `explanation`, or `draft`). Statuses are `accepted`, `ingesting`, `ready`, `generating_proposals`, `needs_input`, `rendering`, `completed`, and `failed`; failed requests carry an `error_code`. Processing is synchronous: inspect the returned `request_id` after the POST finishes, not by polling an accepted job.

### Extracted structure

The structure endpoint returns the extracted structure directly:

```json
{
  "document_id":"opaque-id","document_kind":"cf1","page_count":1,"sha256":"<64 lowercase hex characters>",
  "pages":[{"page":0,"width":612,"height":792,"text":"...","boxes":[{"id":"p0-t0","text":"...","rect":[10,20,100,30],"confidence":100.0,"source":"pdf_text"}],"protected_regions":[]}],
  "widgets":[{"id":"p0-w0","field_name":"member_name","page":0,"rect":[10,20,100,30],"type":"text","options":[],"value":"","max_length":0,"flags":0,"protected":false}]
}
```

Page indexes are zero-based; rectangles use PDF bottom-left coordinates `[x0,y0,x1,y1]`. Page boxes have `id`, `text`, `rect`, `confidence`, and `source` (`pdf_text`, `ocr`, or `layout`); layout boxes also have `type`, `options`, and `protected`. `protected_regions` is an array of rectangles. Widget `type` is `text`, `choice`, `signature`, `button`, `checkbox`, or `radio`.

## Form conversation and drafts

A message request has this shape; all keys are optional, with `skip` and `finalize` defaulting to `false`:

```json
{"document_id":"opaque-id","answer":"Example synthetic answer","skip":false,"finalize":false}
```

An answer or skip responds to the pending question. One response contains at most one `assistant_message`/question. `document_id` may be omitted while the same in-memory conversation is active; include it to select a document and after an API restart. `finalize:true` exports a partial draft; unanswered and unresolved fields remain blank.

The backend asks about missing applicant-editable mapped fields, including optional ones. Use `skip:true` to leave one answer blank, or `finalize:true` to finish a partial draft. Do not combine `answer` with `skip` or `finalize`; sending an answer without a pending question is an error.

Needs-input response example:

```json
{"request_id":"opaque-id","status":"needs_input","assistant_message":"What is the member's name?","field":"p0-w0","name":"member_name","label":"Member name"}
```
`field` is the extracted source-slot ID, unique within the selected document. Mapping `id`, answer storage, direct edit keys, pending/answered state, and `missing_fields` use this ID. Semantic `name` and display `label` are metadata and may repeat; repeated names never share answers. Mapping IDs must match their grounded `widget_id` or `box_id`.


A conflict clarification also includes `conflict`, shaped as `{ "name": string, "sources": Fact[], "asked": boolean, "resolved": boolean }`. A `Fact` has `name`, `value`, `document_id`, `page`, `confidence`, and exactly one source ID (`box_id` or `widget_id`). `compare` groups evidence by semantic name but does not ask the question; the next message turn can ask once per affected document/slot. Resolving one slot never resolves another slot or document.

Completed message response example:

```json
{"request_id":"opaque-id","status":"completed","assistant_message":"The draft is ready. Unanswered or unresolved fields remain blank.","draft_id":"opaque-id","preview_url":"/api/v1/drafts/opaque-id/preview","export_url":"/api/v1/drafts/opaque-id/export","missing_fields":[]}
```

Create a draft directly with `POST /workspaces/{workspace_id}/drafts`:

```json
{"document_id":"opaque-id","values":{"p0-w0":"Synthetic Example"}}
```

`values` maps document-local source-slot IDs to strings (omitted values defaults to `{}`). Semantic-name keys are rejected, not aliased. A successful response is `{"request_id":"...","status":"completed","draft_id":"...","preview_url":"/api/v1/drafts/.../preview","export_url":"/api/v1/drafts/.../export","missing_fields":["p0-w1"]}`. Preview and export URLs are relative API paths. No PDF is submitted externally; export is a separate copy.

## Compare, explanations, and health

Comparison response:

```json
{"request_id":"opaque-id","status":"completed","comparisons":[{"name":"applicant_date_of_birth","outcome":"conflict","sources":[{"name":"applicant_date_of_birth","value":"2000-01-02","document_id":"opaque-id","page":1,"confidence":0.9,"box_id":"p1-t0"}]}]}
```

`outcome` is `agreement`, `conflict`, or `insufficient_evidence`; each source is linked to a `box_id` or `widget_id` in its document. A comparison with no matching facts can return an empty `comparisons` list.

OCR source confidence retains Tesseract's 0–100 scale; native text boxes use 100, and widget-source confidence is `null`. Source values and IDs are validated against the extracted structure. Unresolved conflict values are excluded even when passed directly to draft creation.

Explanation response shape is `{"request_id":"...","assistant_message":"...","status":"completed|needs_input|abstained","citations":[{"term":"...","feed":"DSWD|SSS|PhilHealth","url":"https://..."}]}`. Citations can be empty. Explanations use bundled official-source English government-service descriptions, include “Demo — not official government advice,” and abstain outside the corpus; they do not determine eligibility or approve benefits. Routes and response fields are unchanged.

For `Explain this form` (or `Explain the form`), supply the selected uploaded `document_id`. The backend verifies workspace ownership and requires every normalized corpus `document_marker` for a cited form to occur in runtime-extracted PDF text across its pages; filenames are not evidence. Missing selection returns `needs_input`, unknown forms abstain, and multiple matching forms require clarification. An explicit service query such as `Explain SSS` searches corpus content independently of the selected PDF.

Skill activation is deterministic endpoint dispatch, not automatic skill discovery: messages load `government-form-assistant`, comparisons load `cross-document-checker`, and explanations run the local `government-service-explainer` agent. The model chooses query strings for the allowlisted `lookup_government_service` tool, which performs literal case-insensitive grep-style search across bundled `services.json` record content, then synthesizes the retrieved definitions in English. Completed answers must search first and select only retrieved record IDs; the backend maps those IDs to public citations. The loop allows three tool rounds and one shared retry for invalid tool calls or final output. No embeddings, web browsing, shell, arbitrary path access, or remote inference fallback are used. Unavailable inference returns `inference_unavailable`, not canned success. Editing skill prose alone does not add searchable knowledge; update `services.json` and its provenance notes.

Health response shape:

```json
{"api":"ok","database":"ok","inference":{"reachable":true,"model":"LFM2.5-2.6B-Q4_K_M","loaded_models":["..."],"context_tokens":8192}}
```

When local inference is unreachable, `reachable` is `false` and `loaded_models` is omitted; no remote fallback is used.

The default `lfm` profile reports `LFM2.5-2.6B-Q4_K_M`; selecting
`PAPELLESS_MODEL_PROFILE=qwen` reports `Qwen3.5-4B-Q4_K_M`.

## Errors

HTTP errors use FastAPI's envelope; `request_id` is present when an operation request was created:

```json
{"detail":{"error_code":"not_found","request_id":"opaque-id"}}
```

Known codes include `not_found` (`404`), `upload_too_large` (`413`), `artifact_unavailable` (`404`), `artifact_modified` (`409`), `processing_failed` (`422`), and `inference_unavailable` (`503`). Invalid JSON/body fields use `422` with FastAPI's validation-list form, not this error-code object, e.g. `{"detail":[{"type":"missing","loc":["body","query"],"msg":"Field required"}]}`. Unknown request properties are rejected; string inputs are limited to 4,000 characters, and explanation `query` to 1–500 characters.
