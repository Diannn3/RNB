# PapelLess

A cinematic introduction and a live local-API document workspace. React, Vite, TypeScript and Tailwind. The landing keeps its fictional illustrations; they are not a sample workflow or downloadable documents.

## Run locally

Use synthetic documents only: this localhost demo has no authentication. Install locked dependencies with `npm ci` in `frontend/`. Start the matching local model using the root [runtime instructions](../RUNTIME.md), then start the API from the repository root with `.venv/bin/python -m backend --model qwen` (or `--model lfm`). Run `npm run dev` in `frontend/`. The Vite same-origin `/api` proxy targets `127.0.0.1:8000`; CORS is not required. A static production host must supply the equivalent proxy. `npm run build` produces the frontend bundle, not the API or inference server.

No tests were run for the integration. Subsequent authorized startup verified the running frontend proxy, API/database health, and matching local model identity for LFM and Qwen without generation calls. Existing `npm test` and `npm run test:e2e` commands require separate authorization; surviving frontend checks cover PDF geometry and landing presentation, not a certified live end-to-end journey.

## Live workflow

- `/` preserves the approved paper-light hero and GSAP narrative. All workspace entry links lead to `/app`.
- `/app` has a centered entry screen with a filename dropdown for reopening persisted PDFs. Names are retained for new uploads; legacy records show an earlier-upload label. The reserved mascot slot is intentionally empty until the supplied `pely.webp` asset is available.
- Uploading the first PDF automatically requests its first question. Subsequent supporting PDFs do not interrupt the active form. Answer or skip its pending question; source-slot IDs, not semantic names, identify editable values. The viewport-height workspace keeps the composer visible while messages and the original PDF scroll independently. A response spinner indicates work in progress; the upload/ID/service rail collapses after upload and can be reopened with the header’s Workspace tools control.
- Conversation and Review are the two workflow tabs. Ask “Explain DSWD AICS” or “Compare my documents” in the same composer, or use its suggestion buttons. Explanation and comparison replies stay in the conversation with citations and inspectable source evidence; they do not answer or advance the pending form field. Explanations remain limited to the bundled official-source corpus and are demo information, not government advice; unsupported forms receive an explicit abstention. Enter sends; Shift+Enter adds a line break.
- Prepare a draft from direct slot edits or the conversation. Partial drafts are allowed; missing and unresolved fields remain blank. Inspect the returned PNG preview, missing-field list, and optional full multipage PDF view, then explicitly confirm human review before the final PDF download.
- New workspace and document/value changes invalidate frontend download confirmation. Confirmation is never supplied by the model.

There is no offline, deterministic sample, manual fallback, project-file restoration, local PDF writer or Word export. Unavailable inference produces an explicit backend error; there is no remote fallback. Upload, extracted structure, existing artifact download and corpus explanations do not require inference.

## Persistence and safety

Documents leave the browser for the local API. SQLite metadata and uploaded/generated artifact files persist across backend restarts. Conversation progress and frontend UI state are working memory; after a restart select the document to begin a new conversation. The API has no deletion endpoint. Clearing or changing the browser workspace does not erase persisted server files. Do not upload personal records.

PDF upload limits are 10 MiB and 10 pages. Export is PDF only, a separate draft copy; no signatures, submissions or eligibility decisions. API pages are zero-based and PDF rectangles are bottom-left coordinates; the viewer uses one-based displayed pages and transforms evidence with its current viewport.

Workspace defaults to light with an explicit dark toggle. PDF pages remain paper-colored. Branding, local fonts, reduced motion and the landing visual identity are preserved.

See [API contract](../API_CONTRACT.md), [integration](docs/INTEGRATION.md), [product context](PRODUCT.md), [design](DESIGN.md), [acceptance](GOAL_CONTRACT.md) and [dependency notices](THIRD_PARTY_NOTICES.md). Historical receipts do not verify this live integration.
