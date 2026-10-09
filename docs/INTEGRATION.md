# Backend integration

## Contract

Implement `PaperworkAgentAdapter` from `src/domain.ts`, and call `connectPaperworkAgent(adapter)` before mounting React in `src/main.tsx`. Capabilities describe analysis, model availability and inference route separately. Current routes support `sample`, `none` and `local`; introducing remote transmission requires an explicit product/privacy decision and contract extension.

`analyze({ target, supporting }, signal)` returns `{ documentHash, analysisRevision, fields }`. Input documents carry original bytes, SHA-256 hashes, page counts, role and support classification. Respect AbortSignal and return a nonempty analysis revision. The workspace rejects stale document/session results and results arriving after user edits. Do not invent HTTP endpoints or a streaming protocol: none is assumed here.

Use the target hash returned from ingestion. Preserve actual AcroForm names as field identifiers and their text/checkbox/radio/dropdown semantics. Candidates, source spans, conflicts and questions are separate types. A suggested answer is not a human approval; new suggestions require renewed review.

## Conversation turns

Optionally implement `turn(input, signal)` and advertise `capabilities.conversation`. Turns are available only when the model is ready and the inference route is local. Inputs include request ID, session epoch, target/supporting documents, analysis revision, current fields, transcript, current question and user text. Return the matching target hash and analysis revision, an assistant message, an explicit `intent` (`answer`, `pdf_question`, `clarification`) and an optional field question. An answer result carries `answer: { fieldId, expectedRevision, value, source? }`; only the current pending field and matching revision may advance. PDF questions and clarification never change answers. Legacy results without intent require an explicit user decision.

Each proposal must carry the actual field ID and expected field revision. Responses are schema-validated; stale revisions, incompatible widget values, unknown sources and quotations absent from the PDF are rejected. Proposals require explicit acceptance, and never grant approval. AbortSignal cancels the turn and quotation loading; clear, edits and document replacement invalidate pending results. The deterministic sample is not a general-purpose model.

The frontend keeps the transcript and composer across stage navigation. Stop and Retry preserve the original user message. Messages must have stable unique IDs to avoid duplicate replies.

## Evidence details

Supply exact quotation, document ID and one-based page. Optional `rects` arrays contain `[x1, y1, x2, y2]` PDF user-space rectangles and use PDF coordinate geometry, transformed through the renderer's current viewport. Missing geometry uses quoted navigation; the frontend can locate contiguous exact text but never claims an approximate location as authoritative. Real manual linking checks only that a quotation exists, not whether it supports an answer.

Do not return fabricated sources or confidence. Contextual alternatives should explain interpretation; permanent and present addresses can legitimately differ. Human corrections invalidate prior evidence and approval. Source removal invalidates related candidate/conflict provenance.

## Export and restoration

Verification uses the same PDF writer with a working policy, including current unapproved edits. Final export uses the reviewed policy. Only current reviewed values are exported. Non-fillable forms receive a separate answer sheet. Required status comes from PDF metadata or a user's manual marking. Original bytes remain available and unsupported structures must not be removed. The sample is isolated from uploaded files.

Project JSON is versioned and validated with Zod. It does not embed PDFs. Restoration recomputes identities, rebuilds the actual form inventory, validates options/source links, and invalidates review when document hashes change. Neither Zustand persistence nor browser storage is enabled.

## Boundaries

Analysis is a deterministic synthetic adapter until integration. OCR, semantic understanding, remote authentication, streaming, offline installation, submission and signing are not implemented. Keep model availability truthful. Export font coverage follows the supplied Plus Jakarta Sans font; arbitrary scripts are not guaranteed.

## Sequential interview and final confirmation

Every editable field begins pending, including detected values. `progress` binds answered/explicit_blank dispositions to field revisions. Required blanks cannot complete; optional blanks require explicit action. Zero editable fields require manual question definition. Chat corrections reopen that field and subsequent fields conservatively because no backend dependency graph is assumed.

Continue opens a Yes/No dialog. Yes atomically records approvals and a snapshot of document identities, field revisions and dispositions. Changes invalidate the snapshot. Export routes require a current snapshot; model responses never grant it. Project schema v3 carries interview progress but never restores final confirmation. v1/v2 values require a fresh interview. Changed identities invalidate progress.

PDF previews use the exact downloadable bytes. Word uses dynamically loaded docx 9.9.0 and includes approved values, explicit blanks and source references. Its Content preview uses the same confirmed fields and is not a pagination/layout preview. Browser fonts in Word depend on the recipient's Word viewer. Supported Unicode is checked in generated XML; arbitrary-script PDF coverage remains bounded by the local font.
