---
name: cross-document-checker
description: Compare claims and field values across the current workspace's documents, preserving source provenance and flagging mismatches without choosing a medically correct value.
---

# Cross-Document Checker

## Purpose and limits

Compare explicit statements or mapped fields across documents in the active workspace and report agreement, mismatch, or insufficient evidence. This is a document-consistency aid, not a source-of-truth resolver. Never decide which candidate is medically correct, clinically plausible, eligible, or otherwise preferable. Do not invent or normalize facts to force agreement.

The demo is synthetic-only by operator policy; real patient data is prohibited. Runtime is local LiquidAI LFM2.5-2.6B through llama.cpp with FastAPI/SQLModel/SQLite and typed allowlisted tools. Use only approved typed tools; never Bash, raw SQL, unrestricted filesystem access, remote models, signing, or external submission. The API is localhost-only and has no login; do not treat that as a technical guarantee of authorization.

## Procedure

1. Establish the comparison scope from the user's explicit request and documents already present in the active workspace. Never inspect unrelated workspaces or search for additional documents. If a document is unsupported or cannot be read reliably, report that limitation.
2. Extract candidate facts only through approved local document tools. For each candidate, retain provenance: document identity within the current workspace, page or section, field/label when available, exact extracted text/value, and OCR confidence when OCR supplied it. Tesseract 5 printed English OCR only; handwriting is unsupported. Preserve low-confidence OCR as uncertain rather than silently correcting it.
3. Match items only when their labels, structures, and meanings support comparison. Do not equate superficially similar fields, infer missing values, or treat absence as disagreement. If alignment is uncertain, mark it as not comparable and explain why.
4. Compare the literal supported values and report one of: agreement, conflict, not comparable, or missing/insufficient evidence. Quote or paraphrase narrowly and preserve the source references for every reported item. Do not rank candidates by medical plausibility, source prestige, recency, apparent correctness, or model confidence. If sources conflict, present the alternatives with their provenance and leave resolution to the user; never select a medically correct candidate.
5. Ask at most one natural-language question per API response. Limit each inference request to three tool rounds and one retry, not the conversation. A conflict gets one clarification attempt; unresolved fields remain blank.
6. If the comparison is part of form preparation, only safe, independently mapped values may continue to export. Leave unresolved conflicts blank and allow safe partial draft behavior; do not use checker output to bypass structural mapping validation or locked-field rules. Draft PDFs use the `DRAFT` filename suffix only; do not watermark, sign, or submit.
7. Keep evidence within the active workspace. Do not promote or reuse unknown mappings, field associations, or comparison outcomes in another workspace. GPT-Luna semantic maps, if present, are development comparators only and never runtime fallbacks.
8. Do not persist conversation bodies, extracted text, or field values as working state. Retain artifact files and metadata across shutdowns and restarts; there is no deletion workflow. Never log document contents, prompts, filenames, or field values.

## Output format

For every comparison, state the compared concept, outcome, and provenance for each candidate. Clearly mark uncertain OCR or unsupported alignment. For conflicts, list the alternatives without recommending one. For insufficient evidence, state what could not be established. Keep the report English-only and synthetic-only.

## Guardrails

- Provenance accompanies every candidate; do not detach a value from its source.
- This tool reports consistency only; it never adjudicates medical correctness.
- No unsupported inference, field mapping, handwriting interpretation, external sources, or cross-workspace reuse.
- Preserve conflict; clarification may be asked once, unresolved values remain unresolved/blank for exports.
- Follow local-only, no-sensitive-logging requirements. Working state is ephemeral; uploaded PDFs, previews, and exports are persistent.
