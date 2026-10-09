# Live frontend acceptance contract

Implement [API_CONTRACT.md](../API_CONTRACT.md) end to end in the frontend while preserving the approved landing identity, GSAP narrative, supplied assets, and light workspace with an explicit dark toggle.

## Required behavior

- Use only the live localhost API via a same-origin proxy. Synthetic PDFs only; no authentication and no remote fallback.
- Create/open workspaces; upload/list PDFs; load structure and original artifacts; navigate grounded box/widget evidence with correct zero-based API to one-based viewer pages and PDF viewport geometry.
- Support document conversation answers, skips, conflict clarification and partial finalization, plus direct grounded source-slot edits, comparisons, corpus explanations and returned request status inspection.
- Prepare partial or complete drafts, show the returned PNG preview and missing fields, require explicit human review confirmation before PDF download, and invalidate confirmation when document/values/draft change.
- Surface backend/validation/availability errors truthfully with request IDs where returned. Do not substitute invented answers, manual flow or sample success.
- Explain local API persistence: metadata and files survive restarts; conversation working memory does not. No delete endpoint exists. Browser clearing is not server deletion.
- Remove sample/manual workflows, project restore/download, local PDF generation and Word export. Landing fictional illustrations are not real workflows or downloadable drafts.
- No signing, submission, eligibility decisions, personal-data uploads, deployment or unrelated asset changes.

## Evidence boundary

The user permits BUILD ONLY and forbids tests, model calls and backend startup in this assignment. The integration owner performs the build and manual frontend inspection. Surviving regression checks may be run only under separate authorization. Earlier manual/sample receipts are superseded and do not establish live integration correctness, accessibility certification or production readiness. Do not report checks that were not exercised.
