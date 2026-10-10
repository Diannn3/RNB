# Live backend integration

The authoritative wire contract is [API_CONTRACT.md](../../API_CONTRACT.md). The old `PaperworkAgentAdapter`, deterministic sample, browser-only manual workflow, project restore and local PDF/Word writers have been removed.

## Transport

`src/api.ts` provides native-fetch `api`, `apiBlob`, and `resource` helpers. Requests use same-origin `/api/v1`; paths already beginning `/api/v1` stay unchanged. Encode each opaque resource ID as one path component. JSON string bodies receive JSON Content-Type; multipart PDF uploads never set it manually. Backend codes, validation failures and request IDs are surfaced to people rather than converted into synthetic success.

The Vite `/api` development proxy targets the separately running localhost API on port 8000. The backend has no CORS or authentication. Use synthetic documents only. Production serving needs an equivalent reverse proxy. No remote service or offline fallback is permitted.

## Resources and operations

Create/get workspaces; upload/list PDFs; inspect extracted structure and original artifacts; answer/skip/finalize a document conversation; compare records; request corpus explanations; inspect returned request statuses; create drafts, retrieve PNG previews and POST PDF exports. Operations are synchronous: inspect their returned request IDs after the POST finishes, not through background-job polling.

A PDF upload uses multipart field `file`, at most 10 MiB and 10 pages. Its artifact ID equals document ID. Draft `values` keys are document-local grounded box/widget IDs. Semantic names may repeat and are never edit aliases. Protected slots remain excluded. Conversation `answer`, `skip` and `finalize` are mutually exclusive; an answer requires a pending question. Select `document_id` when beginning or restarting a conversation.

Comparison outcomes are agreement, conflict or insufficient evidence. Facts must point to their actual box/widget in their document. Conflicts resolve per slot and document, not per semantic name. OCR confidence may be 0–100 and widget confidence is null; do not present all confidence as a uniform percentage.

## Evidence geometry

API structure and fact pages are zero-based. `PdfViewer` uses one-based `page` and `source.page`; callers convert once. Props remain `bytes: Uint8Array`, `page: number`, `onPage(page)`, optional `source`, and optional `expectedPages`. Its exported `SourceSpan` carries `documentId`, one-based `page`, `quote`, and optional PDF bottom-left `[x0,y0,x1,y1]` rectangles. Viewer transforms rectangles through the actual viewport at each zoom/rotation. If no precise geometry exists, it may locate exact contiguous quoted text; otherwise it reports the lack of a precise highlight.

## Draft review and download

Both direct draft creation and conversation finalization may produce partial drafts. Display `missing_fields`; unanswered/unresolved values remain blank. Retrieve the server PNG preview; the full PDF may also be fetched with POST export for in-app multipage review, without initiating a download. Require explicit human review confirmation before offering the final PDF download. Replacing the document, changing values or regenerating a draft invalidates confirmation. Model completion is not confirmation. There is no Word format or browser-generated alternative export.

## Persistence and availability

SQLite metadata and artifact files persist across restarts. Conversation answers, mappings, pending questions and conflict progress are working memory and are lost on restart. Frontend state does not promise durable chat restoration. The API has no delete endpoint, so clearing local UI cannot erase server resources.

Health reports API/database/inference separately. Inference-unavailable errors are real failures, not an invitation to manual or sample fallback. Upload, structure and saved artifacts do not require inference. Service and whole-form explanations require local inference: the model chooses scoped literal grep-style corpus searches and synthesizes retrieved evidence in English, without embeddings, web or shell access. They retain official-source citations and the demo-not-official-advice caveat and abstain outside the corpus. Current-field help uses the separate sourced offline field bank; it never saves an answer or advances the pending question.

Contracted questions beginning with `whats`, `what's`, or `what’s` route to explanations, not form answers. Browser smoke with the Pantawid form confirmed the exact apostrophe-free question sent only an explanation request and left the requester-name question pending. Previously saved erroneous answers are not automatically removed.

This integration pass runs no tests, backend startup or model calls. Build and manual review are the integration owner's checks; previous workflow receipts are not evidence for this cutover.
