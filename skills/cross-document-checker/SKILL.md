---
name: cross-document-checker
description: Compare applicant facts across current-workspace documents for DSWD AICS, SSS E-1, and PhilHealth PMRF, preserving provenance and reporting mismatches without resolving identity or eligibility.
---

# Cross-Document Checker

## Purpose and limits

Compare explicit statements or mapped fields across documents in the active workspace for the selected DSWD AICS, SSS Personal Record E-1, and PhilHealth PMRF flows. This is a document-consistency aid, not a source-of-truth resolver, identity-verification service, or eligibility adjudicator. Never decide which candidate is correct, authentic, eligible, or otherwise preferable. Do not invent or normalize facts to force agreement. CF-1, Annex B, and synthetic parser derivatives are technical-only, non-default fixtures, not additional applicant service flows.

The demo is synthetic-only by operator policy; real applicant or third-party data is prohibited. Runtime is local LFM2.5-2.6B Q4_K_M (English, default) or Qwen3.5-4B Q4_K_M (Taglish), selected by `PAPELLESS_MODEL_PROFILE=lfm|qwen`, both with an 8,192-token context through llama.cpp with FastAPI/SQLModel/SQLite and typed allowlisted tools. Use only approved typed tools; never Bash, raw SQL, unrestricted filesystem access, remote models, signing, or external submission. The API is localhost-only and has no login; do not treat that as a technical guarantee of authorization.

## Procedure

1. Establish the comparison scope from the user's explicit request and documents already present in the active workspace. Never inspect unrelated workspaces or search for additional documents. If a document is unsupported or cannot be read reliably, report that limitation.
2. Extract candidate facts only through approved local document tools. For each candidate, retain provenance: document identity within the current workspace, page or section, field/label when available, exact extracted text/value, and OCR confidence when OCR supplied it. Tesseract 5 printed English OCR only; handwriting is unsupported. Preserve low-confidence OCR as uncertain rather than silently correcting it.
3. Match items only when their labels, structures, and meanings support comparison. Do not equate superficially similar fields, infer missing values, or treat absence as disagreement. If alignment is uncertain, mark it as not comparable and explain why.
4. Compare the literal supported values and report one of: agreement, conflict, not comparable, or missing/insufficient evidence. Quote or paraphrase narrowly and preserve source references for every item. Do not rank candidates by plausibility, source prestige, recency, apparent correctness, or model confidence. Names, addresses, dates of birth, contact details, applicant/representative relationships, SSS numbers, and PhilHealth PINs are distinct concepts: do not treat a PhilHealth PIN as an SSS number or an authorized representative as the beneficiary. Agreement does not establish identity, authenticity, eligibility, or benefit entitlement. If sources conflict, present alternatives with provenance and leave resolution to the applicant/operator; never select a candidate.
5. Ask at most one natural-language question in natural Taglish per API response, preserving source quotes and values. Limit each inference request to three tool rounds and one retry, not the conversation. A conflict gets one clarification attempt; unresolved fields remain blank.
6. If the comparison is part of form preparation, only safe, independently mapped applicant-answerable values may continue to export. Leave unresolved conflicts blank and allow safe partial drafts; checker output never bypasses structural mapping validation or locked-field rules. Do not populate agency/staff-only areas, assessments, benefit amounts, certifications, signatures, consent, fingerprints, or thumbmarks. Draft PDFs use the `DRAFT` filename suffix only; do not watermark, sign, submit, or modify source documents.
7. Keep evidence within the active workspace. Do not promote or reuse unknown mappings, field associations, or comparison outcomes in another workspace. GPT-Luna semantic maps, if present, are development comparators only and never runtime fallbacks.
8. Do not persist conversation bodies, extracted text, or field values as working state. Retain artifact files and metadata across shutdowns and restarts; there is no deletion workflow. Never log document contents, prompts, filenames, or field values.

## Output format

For every comparison, state the compared concept, outcome, and provenance for each candidate. Clearly mark uncertain OCR or unsupported alignment. For conflicts, list the alternatives without recommending one. For insufficient evidence, state what could not be established. Use the selected profile's language (English for LFM, natural Taglish for Qwen), preserve source quotes and values, and keep the report synthetic-only.

## Guardrails

- Provenance accompanies every candidate; do not detach a value from its source.
- This tool reports consistency only; it never verifies identity, adjudicates eligibility, calculates benefits, guarantees qualification, or makes agency decisions.
- No unsupported inference, field mapping, handwriting interpretation, external sources, or cross-workspace reuse.
- Preserve conflict; clarification may be asked once, unresolved values remain unresolved/blank for exports.
- Follow local-only, no-sensitive-logging requirements. Working state is ephemeral; uploaded PDFs, previews, and exports are persistent.
