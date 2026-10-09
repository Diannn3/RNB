# Backend integration

## Contract

Implement `PaperworkAgentAdapter` from `src/domain.ts`, and call `connectPaperworkAgent(adapter)` before mounting React in `src/main.tsx`. Capabilities describe analysis, model availability and inference route separately. Current routes support `sample`, `none` and `local`; introducing remote transmission requires an explicit product/privacy decision and contract extension.

`analyze({ target, supporting }, signal)` returns `{ documentHash, analysisRevision, fields }`. Input documents carry original bytes, SHA-256 hashes, page counts, role and support classification. Respect AbortSignal and return a nonempty analysis revision. The workspace rejects stale document/session results and results arriving after user edits. Do not invent HTTP endpoints or a streaming protocol: none is assumed here.

Use the target hash returned from ingestion. Preserve actual AcroForm names as field identifiers and their text/checkbox/radio/dropdown semantics. Candidates, source spans, conflicts and questions are separate types. A suggested answer is not a human approval; new suggestions require renewed review.

## Evidence

Supply exact quotation, document ID and one-based page. Optional `rects` arrays contain `[x1, y1, x2, y2]` PDF user-space rectangles and use PDF coordinate geometry, transformed through the renderer's current viewport. Missing geometry uses quoted navigation; the frontend can locate contiguous exact text but never claims an approximate location as authoritative. Real manual linking checks only that a quotation exists, not whether it supports an answer.

Do not return fabricated sources or confidence. Contextual alternatives should explain interpretation; permanent and present addresses can legitimately differ. Human corrections invalidate prior evidence and approval. Source removal invalidates related candidate/conflict provenance.

## Export and restoration

Only current reviewed values are exported. Non-fillable forms receive a separate answer sheet. Required status comes from PDF metadata or a user's manual marking. Original bytes remain available and unsupported structures must not be removed. The sample is isolated from uploaded files.

Project JSON is versioned and validated with Zod. It does not embed PDFs. Restoration recomputes identities, rebuilds the actual form inventory, validates options/source links, and invalidates review when document hashes change. Neither Zustand persistence nor browser storage is enabled.

## Boundaries

Analysis is a deterministic synthetic adapter until integration. OCR, semantic understanding, remote authentication, streaming, offline installation, submission and signing are not implemented. Keep model availability truthful. Export font coverage follows the supplied Plus Jakarta Sans font; arbitrary scripts are not guaranteed.
