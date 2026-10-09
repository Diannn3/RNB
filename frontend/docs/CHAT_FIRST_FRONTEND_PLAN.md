> Historical plan, superseded by [Live backend integration](INTEGRATION.md) and [current acceptance](../GOAL_CONTRACT.md). Manual/sample flows, browser-only privacy, project restore and Word export described below are obsolete. The live synthetic-only API persists uploaded/generated files locally, has no remote fallback, permits partial drafts and requires human confirmation before PDF download.

# PapelLess: upload, guided conversation, verification, export

Date: 2026-10-09. Status: proposed revision; application implementation stopped at the user's request.

## Decision and scope

The user requested this order: upload a PDF, use a chatbot, verify by editing and previewing, then open an export page/tab. The user confirmed **guided form interview plus PDF questions** as the chatbot's purpose. This supersedes the earlier combined review workspace as the primary journey.

Preserve PapelLess's supplied logos, graphite introduction, bright paper workspace, Plus Jakarta Sans, React/Vite/TypeScript/Tailwind stack, session-only documents, evidence provenance, and explicit human approval. The friend remains responsible for backend/model implementation. This report changes the proposed frontend journey, not the inference or privacy contract.

## Audit of the current implementation

| Area | Current behavior | Required change |
|---|---|---|
| Upload | Target upload opens the field/document workspace | Open conversation after successful ingestion |
| Chatbot | No persistent transcript or turn API; questions are field controls | Dedicated guided conversation with PDF questions and field-linked responses |
| Verification | Original PDF, editable field queue, evidence and approvals share one workspace | Dedicated review stage with preview reflecting the person's current edits |
| Export | Generated PDF appears in a dialog | Dedicated export page with exact output preview, unresolved summary and download |
| Navigation | Document/Review/Questions switch panes, rather than workflow stages | Separate stage navigation from within-stage document/answer toggles |
| Integration | Adapter exposes only analyze(input, signal) | Add a typed conversation contract without inventing a network protocol |
| State | Session documents and field revisions exist; local dialogs own some workflow state | Shared session owner for stage views, conversation and revision-bound previews |

Audited source: src/main.tsx, src/Workspace.tsx, src/domain.ts, src/store.ts, src/pdf.ts, src/PdfViewer.tsx, src/components.tsx, package.json and docs/INTEGRATION.md. Source and local sample UI support the navigation diagnosis. An independent frontend critic reached the same conclusion and supplied transition, preview and approval recommendations. This is not evidence of working backend conversation.

Existing useful foundations: PDF parsing/viewing, real field IDs and types, in-memory session store, exact citations, approval invalidation, sample isolation, draft generation and project identity checking. Reuse these rather than duplicating their rules.

### Existing verification debt

The current audit branch contains two local commits, 534a70b and 99abc2e, made before the revised-flow request. Existing uncommitted showcase work is preserved. The newer showcase checks passed two Chromium scenarios but failed the no-JavaScript text assertion; full cross-browser verification of audit changes remains outstanding. Native 200% zoom and screen-reader checks are not established. These checks must not be represented as a passed receipt for the proposed journey.

## Research synthesis

The local master brief already identifies an adaptive interviewer and source-linked human review as product goals. The new request makes their sequence explicit.

GOV.UK's [question-page pattern](https://design-system.service.gov.uk/patterns/question-pages/) supports focused questions and concise help; its [check-answers pattern](https://design-system.service.gov.uk/patterns/check-answers/) supports a dedicated correction and confirmation stage. Apply those principles to conversation and review, while retaining PapelLess styling.

Microsoft HAX recommends [clarifying uncertainty](https://www.microsoft.com/en-us/haxtoolkit/guideline/scope-services-when-in-doubt/) and [efficient correction](https://www.microsoft.com/en-us/haxtoolkit/guideline/support-efficient-correction/). Therefore ambiguous answers should become visible questions or alternatives; a person should be able to change an answer directly.

[AI Elements](https://elements.ai-sdk.dev/components/conversation) provides useful conversation/composer/citation patterns. Its examples assume a backend integration; copying them does not create PapelLess's local model capability. [assistant-ui's external-store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) supports custom state and turn handlers, but introduces additional runtime ownership. Current source inspection found Radix and assistant-cloud dependencies in its React package despite Base UI being available for its styled components. Dependencies alone do not imply network transmission.

Historical upstream issue reports identify regression scenarios: nested scroll containers, turn anchoring, StrictMode composer state and cancellation duplication. Several are now closed and linked to fixes. These reports inform acceptance tests; they do not prove bugs remain in current releases.

## Proposed journey

```text
Upload → Conversation → Verification → Export
            ↑               │           │
            └── clarify ────┘           │
                            ← edit ─────┘
```

### 1. Upload — "Start with your form"

One primary target PDF, optional supporting records, file summaries and actionable support warnings. Keep sample and project-resume actions. Select files with a button as well as drag/drop. Display actual limits and parsing states.

After ingestion succeeds, open Conversation. If a PDF is unsuitable for the available workflow, explain the available fallback before continuing. Supporting records remain optional and can be added later through a document context panel.

### 2. Conversation — "Let's work through your form"

Desktop: a readable central transcript around 720px wide, composer below it, and a compact document/answer context rail. The document viewer opens alongside the conversation when a citation is selected. Avoid permanently compressing both the transcript and PDF into narrow columns.

Mobile: transcript and composer are the primary view. Documents open in a drawer or separate within-stage view with focus returning to the citation trigger. Keep the stage header separate from these view controls.

Conversation behavior:

- Begin with an actual form summary and the next consequential question. Counts derive from parsed or analyzed data.
- Ask one focused question at a time; explain why it matters using the form's wording when available.
- Use typed answer controls for choices, dates, checkboxes and free text; preserve PDF semantics.
- Link evidence using document name, page and exact quotation. Opening it preserves the current question and composer draft.
- Let users ask questions about the PDF, then return to the pending form question.
- Expose **Use this answer**, **Change**, **Skip for now**, and **Review answers** where applicable. Accepting a proposed value does not grant final approval.
- Keep a compact summary of collected answers and unresolved items outside the transcript so important actions are not buried.
- Provide Stop and Retry for real cancellable operations; retain the user's submitted message exactly once.
- Preserve reading position when users scroll up; offer a labelled **Latest message** control.
- Render safe text and structured response parts; do not parse prose into field updates or execute document instructions.
- Announce completed messages politely. Announce useful operation states without reading every streamed token. [W3C's log technique](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA23.html) and [status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) inform this behavior.

**Continue:** an explicit Review answers action. Missing answers may remain; finishing every chat question is not a prerequisite for verification. Pending turns must finish or be explicitly stopped before transition so late replies cannot change the review silently.

Capability modes:

| Mode | Available conversation |
|---|---|
| Real PDFs, backend unavailable | Clearly labelled guided manual interview from actual parsed fields; direct document viewing. Explain that semantic PDF Q&A is unavailable. |
| Isolated sample | Deterministic fictional interview and evidence-linked PDF questions for the supplied sample; clearly labelled sample |
| Connected local adapter | Model-backed form interpretation, adaptive interview and cited PDF answers, according to actual capabilities |

A non-fillable PDF with no semantic adapter must support manually defining answers; do not pretend to understand its fields. Never simulate arbitrary AI answers for uploaded records.

### 3. Verification — "Check your answers"

Desktop: editable answers alongside a PDF preview, with resizable panes. Mobile: Answers / Preview view controls. Keep source inspection available without losing edit state.

Group entries by Needs attention, Ready to review and Reviewed. Every entry exposes its label, current value, answer origin, evidence where present, Change and Review. A manually entered value is **Answered by you**; approval is **Reviewed by you**. Documentary support remains a separate fact.

The preview must reflect current edits, including values still awaiting approval. Label this clearly as a working preview. Generate it from a snapshot with the same PDF writer and field mapping used for final export, using a separate preview policy. For non-fillable PDFs, show the answer-sheet preview and original source as distinct documents. Unsupported and signed structures keep their existing restrictions.

Coalesce preview work after edits, cancel or discard outdated jobs, and show when a newer preview is being prepared. Do not show an old preview as current. Source links continue to use the original document coordinate space, not guessed locations on generated pages.

Edits invalidate affected approval immediately. The person can ask a focused follow-up from a field and return directly to that field in Verification. Proposed replacements require explicit acceptance; unrelated reviewed values must not be silently overwritten.

**Continue:** explicit Continue to export. Offer complete export only when required answers are resolved and every included value has current approval. Otherwise identify the remaining entries and offer an explicit incomplete draft choice. Unreviewed entries remain blank in output. Do not auto-advance from a chat response or field approval.

### 4. Export — "Your draft is ready"

A full page containing the generated PDF, filename, output type, reviewed/unresolved summary, Download draft and Back to verification. Where an incomplete export was chosen, retain that designation and blank-entry summary. Project-file download is a separate action with a clear explanation of its contents.

The final preview and download use exactly the same immutable bytes. Tie generation to target/supporting hashes, relevant field revisions and approval revisions. Any subsequent edit, source replacement or review change makes the artifact stale and disables download until regeneration. Release stale bytes and object URLs on replacement/clear.

No signing, submission or eligibility claims. An answer sheet must be described as an answer sheet, not a completed original form.

## Visual direction

Retain the graphite cinematic showcase and bright working surfaces. Inside the app use a quiet four-step navigation: Upload / Conversation / Verification / Export, with current/completed states expressed through text and a thin underline. Use links and aria-current="step" for route navigation; do not mislabel route links as ARIA tabs.

The supplied P mark anchors the shared header. Fold geometry can appear in document edges and brief stage transitions. Use large headings on upload and empty states, smaller working headings in chat/review, generous message spacing, thin separators and restrained blue evidence selection. Avoid dashboard card grids, fake avatars, decorative status dots and unrelated model selectors.

GSAP continues to own showcase motion; Anime.js owns short workspace feedback. Avoid animating the chat reading position or delaying controls. Reduced-motion layouts retain every stage and action.

## Architecture and libraries

Recommended route structure, using existing [React Router nested layouts](https://reactrouter.com/start/declarative/routing):

```text
/                         Showcase
/app                      Upload
/app/conversation         Guided interview + PDF questions
/app/verification         Edit, preview and human review
/app/export               Final preview + download
/app/sample               Initialize isolated sample, then enter its conversation
```

One session owner and layout spans the stage routes. Route guards check actual state, not merely which URL was visited. Direct links without documents return to Upload with a clear explanation. Refresh retains session-only behavior; sample initialization must not run again whenever a stage mounts. Switching between sample and real sessions explicitly resets the other mode.

Split Workspace.tsx into SessionLayout, UploadPage, ConversationPage, VerificationPage and ExportPage. Extract reusable DocumentContext, EvidenceDrawer, AnswerEditor and DraftPreview. Move ingestion/restore/cancel coordination into session actions or dedicated hooks rather than duplicating it in pages.

| Need | Recommendation | Reason |
|---|---|---|
| Routes and session | Existing React Router + Zustand | One authoritative document/answer state across pages |
| Accessible controls | Existing Base UI | Keep current styling and focus behavior |
| Editing/validation | Existing React Hook Form + Zod | Typed field controls and validated responses |
| PDF preview/export | Existing React-PDF + pdf-lib/fontkit | Preserve original bytes and tested field semantics |
| Conversation UI | Owned PapelLess components, informed by AI Elements | Narrow field-linked workflow and existing integration boundary |
| Scroll retention | Evaluate use-stick-to-bottom 1.1.6 | Inspected manifest permits React 19, has no runtime dependencies, MIT; browser behavior still requires verification |
| Complete chat framework | assistant-ui is an alternative, not the default | Useful external-store runtime; introduces an additional state/runtime/dependency layer |
| Transport SDK | Add AI SDK only if the friend's contract adopts it | Its default endpoint/provider examples do not define our backend |

No library was installed in this research pass. Main-branch manifest versions are inspection facts, not a substitute for npm publication/lockfile checks before installation. If borrowing AI Elements source, preserve Apache-2.0 attribution; its whole-registry CLI is unnecessary for this Vite application. Use native or instant scroll when reduced motion is requested, including within a scroll helper.

## Conversation contract proposal

Keep analyze; add an optional conversation capability and typed turn operation. The backend friend must agree the interface before real transport implementation. Proposed input: request ID, session epoch, target/supporting hashes, analysis revision, current field revisions, safe transcript parts, question ID, and user action/text; always include AbortSignal.

Proposed response: stable assistant message ID, text/citation parts, field proposals with expected prior revision, focused question/choices and analysis revision. Optional streaming is an adapter capability, not a fabricated sequence. Validate response shape and document/source identities with Zod. Reject replies from old sessions or changed documents, and refuse field patches when expected revisions no longer match.

The frontend owns human approvals; no adapter reply can set them. Store transcript, pending question and typed proposal acceptance in the same session; fields remain the source of truth for export. User corrections supersede old proposals. Prefer a correction turn over complicated transcript branching in the first release.

Project schema v2 can include stage, stable messages, pending question and document-hash references. The project download must disclose that it contains conversation and answers but not PDFs. Support v1 import; reattach matching originals and verify hashes before restoring evidence/approval. Never restore pending requests or generated export bytes from JSON. A saved Export stage returns to Verification with a regeneration explanation; it cannot restore a ready-to-download state. The person explicitly confirms the next export.

Keep all document content in session memory. A local inference adapter is consistent with the current product contract. Cloud transmission, durable chat history and browser persistence require separate product decisions and are not implied by adding a chatbot.

## Implementation sequence and review gates

1. **Screen specification:** create desktop/mobile Conversation, Verification and Export compositions using actual branding and synthetic evidence. Review these screens before completing the flow.
2. **Session and routes:** extract current workspace behaviors, introduce stage navigation and guards, preserve sample/manual isolation and document lifetime cleanup. Exit: back/forward/direct links behave predictably.
3. **Conversation:** build message parts, composer, question controls, source drawer, manual interviewer and deterministic sample turn adapter. Exit: upload → interview → review works without fabricated model capability.
4. **Verification preview:** reuse editors, evidence and approvals; generate revision-bound working previews with shared writer. Exit: typing, toggles and corrections visibly affect the correct preview and invalidate review.
5. **Export page:** move generation/preview/download out of the modal, add complete/incomplete gates and stale artifact handling. Exit: previewed bytes equal downloaded bytes.
6. **Frontend verification and handoff:** deliver the typed adapter contract and verify the full journey in sample/manual modes independently of backend availability. Run deterministic and browser checks, independent visual critique, and manual accessibility review; issue a fresh frontend completion receipt. Agreeing and connecting the friend's real backend is a separate integration gate, with its own model/local-inference checks.

Atomic commits should follow these boundaries on a descriptive feature branch. Preserve the existing unfinished showcase work until it is separately resolved. Do not push, deploy or change repository visibility as part of this planning pass.

### Acceptance scenarios

- Upload opens Conversation; verification and export are separate pages.
- Interview responses populate the intended stable field IDs; PDF questions preserve the pending interview.
- Chat acceptance never counts as review; manual/synthetic/model modes remain distinguishable.
- Source inspection preserves composer draft, question state and focus.
- Stop/retry does not duplicate messages; stale replies cannot overwrite edits or restored sessions.
- Verification previews edited text, checkbox, radio and dropdown values; original PDFs remain intact.
- Re-editing or removing evidence invalidates relevant review and any generated export.
- Complete export is gated; incomplete export requires an explicit choice and omits unreviewed values.
- Preview/download share bytes; non-fillable output is correctly labelled.
- Project v1/v2 restore verifies identity; no pending requests or obsolete approvals resume silently.
- Keyboard navigation, Enter/Shift+Enter and IME composition work; route focus and mobile drawer focus return correctly.
- Chat does not steal scroll when reading history; announcements are useful without token-by-token noise.
- Check 375/768/1024/1366/1920 widths, 1366×768, native 200% zoom, reduced motion, and Chromium/Firefox/WebKit.
- Verify frontend-only mode sends no document contents over the network; test connected local adapter separately.

## Research ledger

Checked 2026-10-09. This focused follow-up inspected **23 external resources**: 19 primary documentation/repository/issue pages and 4 raw source/manifest/license files. Repeat opens/finds are not additional sources. Search hits and inaccessible resources are not counted. Local source excerpts and the independent critique are additional evidence, not external-source counts. Guidance may be older than October 2026; checked date is not publication date. This is not a claim of exhaustive coverage of all chat libraries.

| # | Resource | Contribution |
|---|---|---|
| 1 | [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/) | Dedicated correction and confirmation |
| 2 | [AI Elements Conversation](https://elements.ai-sdk.dev/components/conversation) | Transcript, composer integration, latest-message control |
| 3 | [AI Elements Prompt Input](https://elements.ai-sdk.dev/components/prompt-input) | Composer constraints and submission states |
| 4 | [W3C ARIA23](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA23.html) | Sequential log announcements |
| 5 | [HAX uncertainty](https://www.microsoft.com/en-us/haxtoolkit/guideline/scope-services-when-in-doubt/) | Clarification and degraded capability |
| 6 | [HAX correction](https://www.microsoft.com/en-us/haxtoolkit/guideline/support-efficient-correction/) | Direct changes and recovery |
| 7 | [GOV.UK question pages](https://design-system.service.gov.uk/patterns/question-pages/) | Focused question and short help |
| 8 | [AI Elements Inline Citation](https://elements.ai-sdk.dev/components/inline-citation) | Progressive source detail; adapt to uploaded PDF identities |
| 9 | [assistant-ui external store](https://www.assistant-ui.com/docs/runtimes/custom/external-store) | Custom turn handlers and host-owned edits/cancellation |
| 10 | [assistant-ui repository](https://github.com/assistant-ui/assistant-ui) | Runtime and component alternative |
| 11 | [AI Elements repository](https://github.com/vercel/ai-elements) | Selective source ownership; CLI assumptions |
| 12 | [React Router routing](https://reactrouter.com/start/declarative/routing) | Shared nested layout |
| 13 | [AI SDK chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) | Cancellation/regeneration and explicit transport boundary |
| 14 | [AI Elements issue 133](https://github.com/vercel/ai-elements/issues/133) | Historical nested-overflow regression; closed |
| 15 | [assistant-ui issue 5037](https://github.com/assistant-ui/assistant-ui/issues/5037) | Historical scroll-anchor race; closed, linked fix |
| 16 | [assistant-ui issue 5422](https://github.com/assistant-ui/assistant-ui/issues/5422) | StrictMode composer regression; closed, historical comments differ on fix |
| 17 | [assistant-ui issue 5791](https://github.com/assistant-ui/assistant-ui/issues/5791) | Cancellation/message ownership regression; closed, linked fixes |
| 18 | [use-stick-to-bottom repository](https://github.com/stackblitz-labs/use-stick-to-bottom) | User-controlled scroll retention and ResizeObserver approach |
| 19 | [W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Operation announcements without changing focus |
| 20 | [assistant-ui manifest](https://raw.githubusercontent.com/assistant-ui/assistant-ui/main/packages/react/package.json) | 0.15.25 source manifest, React 18/19 peers, runtime dependencies |
| 21 | [AI Elements conversation source](https://raw.githubusercontent.com/vercel/ai-elements/main/packages/elements/src/conversation.tsx) | role=log, scroll helper and outer overflow-y-hidden |
| 22 | [Scroll helper manifest](https://raw.githubusercontent.com/stackblitz-labs/use-stick-to-bottom/main/package.json) | 1.1.6 source manifest, React 19 peer, MIT and no runtime deps |
| 23 | [AI Elements license](https://raw.githubusercontent.com/vercel/ai-elements/main/LICENSE) | Apache-2.0 attribution requirements |

Local context: index.md's PapelLess map; immutable raw/hackathon/papelless master-context excerpts; relevant wiki source mappings; current frontend code and integration notes. Document instructions were treated as source context, with the latest explicit user direction controlling the proposed journey.
