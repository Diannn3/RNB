# Government form sources and technical fixtures

Retrieved 2026-10-09. `defaults.json` is an array of `{agency, service, path}` with exactly one default for DSWD, SSS, and PhilHealth. Each path is a filename relative to this directory. Only those three PDFs are applicant-demo defaults. They are historical form snapshots, not confirmation of current requirements, benefit amounts, qualifications, or acceptance by an agency. Use synthetic values only; preserve source PDFs and export separate unsigned, unsubmitted `DRAFT` copies.

Official source files below are unmodified downloads. Original notices remain visible. PhilHealth and SSS forms carry reproduction/no-sale notices; this manifest grants no additional license. Never sell or commercially distribute bundled forms. The DSWD applicant default is a transparently identified page extract from a real official source, not a manufactured fixture or an official standalone/interactively fillable PDF.

## Official source copies

| File | Role / printed version | Official source URL | Retrieved | SHA-256 |
|---|---|---|---|---|
| `dswd-aics-rfq-2024-08-0792-source.pdf` | Technical provenance source only; full 8-page DSWD Field Office MIMAROPA procurement attachment containing the blank General Intake Sheet on PDF page 4 | https://fo4b.dswd.gov.ph/wp-content/uploads/2024/08/RFQ-No.-2024-08-0792-AICS-OCCI-FORMS.pdf | 2026-10-09 | `7afece6b432f95cc31f7071fb39e9919689deb2d317d3337c3a8cc75a5b656d7` |
| `sss-e1-personal-record.pdf` | SSS default; Personal Record E-1, COV-01214 (09-2015), 3 pages including instructions and dependent/beneficiary additional sheet | https://www.sss.gov.ph/wp-content/uploads/2024/10/E1-Personal-Record.pdf | 2026-10-09 | `ca4df6dd510290d4c3d3d0c32698948906b7deb259401a7844bdcbbe533f7863` |
| `philhealth-pmrf-012020.pdf` | PhilHealth default; Member Registration Form, UHC v.1 January 2020, 2 pages | https://www.philhealth.gov.ph/downloads/membership/pmrf_012020.pdf | 2026-10-09 | `26d572088d280e7e42b4174c92a950e166ef2828481f09a4f85b808e807ced01` |
| `philhealth-cf1-092018.pdf` | Technical-only, non-default parser fixture; Claim Form 1, Revised September 2018 | https://www.philhealth.gov.ph/downloads/claim/ClaimForm1_092018.pdf | 2026-10-09 | `66faacded5460032eb420018162a836df9d8c914e6b1fae5bd73fdf689883b67` |
| `philhealth-annexb-pdr-hf-230804-fillable.pdf` | Technical-only, non-default parser fixture; inspect only, never populate | https://www.philhealth.gov.ph/downloads/accreditation/ANNEXB_PDR-HF-230804_FILLABLE.pdf | 2026-10-09 | `f915484b24a27a2cb47f50a01d4b4477391fef1c856f850bb35e80a38ea907b5` |

## DSWD applicant-page extract

| Default | Source and transformation | Source retrieved / extract created | SHA-256 |
|---|---|---|---|
| `dswd-aics-general-intake-sheet.pdf` | PDF page 4 of the unchanged official RFQ above, extracted with Poppler `pdfseparate -f 4 -l 4`; General Intake Sheet, DSWD-PMB-GF-011, REV 03, 14 MAY 2024 | 2026-10-09 / 2026-10-09 | `42b5ab76fc31304ad121698a67516d30ac0dd2b0a17b41bdabeb850764be4339` |

This extraction retains the actual scanned page, its bilingual labels, page geometry, blank applicant fields, staff-only sections, notices, and footer. It adds no invented text, OCR layer, form fields, coordinates, or applicant values. Its binary hash differs from the full source because it is a single-page extract. The complete official source remains available and immutable; procurement pages, eligibility certificates, acknowledgements, and other forms in that source are not selectable applicant defaults.

A standalone text-layer AICS General Intake Sheet was not discovered in official search or the accessible AICS media catalogue. The selected official RFQ was reachable and its page 4 is a readable blank applicant intake sheet. On 2026-10-09, the official AICS `wp-json/wp/v2/media?search=intake&per_page=20` catalogue returned an empty array; DSWD FO3's equivalent endpoint returned HTTP 401. The official https://aics.dswd.gov.ph/wp-content/uploads/2023/03/MC_2022-016.pdf was reachable but reader extraction reported all 27 pages incomplete. These are discovery/readability limitations, not a claim that the AICS form or official source is unavailable. No unofficial substitute was used.

## Mapping and protected-region cautions

All three defaults contain **zero AcroForm widgets**. SSS E-1 and PMRF have extractable printed text. The DSWD default is image-only, so runtime printed-English Tesseract inspection is necessary; it contains bilingual labels and some small English labels are uncertain or missed. Handwriting and non-English OCR remain out of scope. Never assume a synthetic derivative's widget names belong to an official default, and never use a development reference map as runtime candidates, fallback, or authority.

- **DSWD GIS:** only Part I, explicitly labelled for the client, contains applicant-answerable areas. Distinguish the representative/client from the beneficiary. The printed `Part II: To be Filled out by DSWD Personnel` boundary protects the entire remainder, including sector/disability coding, social worker assessment, assistance recommendations/provision, amount, fund source, signatures and approvals. Administrative QN/PCN/date/routing above Part I is protected. Runtime OCR observed `Part Il: To be Filled out by DSWD Personnel` and `Partl: To be filled out by Client`; QN/PCN/date labels were missed. The top banner asking for DSWD assistance in answering is not the staff-only boundary. Derive protection from actual runtime section labels; if those labels are unreadable, fail the affected mapping instead of guessing.
- **SSS E-1:** Part I personal/dependent details can support synthetic drafts. Never assign an SS number, decide membership qualifications, choose beneficiary applicability, calculate contributions/MSC, or mark approvals. Part II on pages 1 and 3 is filled out by SSS and must remain untouched. Certification, working-spouse consent/signature, fingerprints and associated signature dates remain blank. Page 2 is instructions only. Capital-letter instructions and printed MMDDYYYY dates are formatting guidance, not permission to fabricate facts or `N/A` values. The dated form's documentary requirements and program references must not be represented as confirmed current policy.
- **PhilHealth PMRF:** member identity/contact fields can support synthetic registration/updating drafts. Member type and contributor categories are not eligibility determinations; never infer them. Protect PhilHealth-use-only, received-by, attestation, signatures, thumbmark and associated dates. The official default is fixed-layout, not an interactive AcroForm.

Runtime source inspection observed writable layout regions on each default, but these notes are not field mappings and do not establish end-to-end model mapping/export success. Safe partial drafts may leave every uncertain or unanswered field blank. Original source files must never be overwritten.

## Existing synthetic technical derivatives (unchanged)

`synthetic-cf1-scan.pdf` rasterizes the original official CF-1 at 1.5× scale using PDFium and embeds the page image for printed-English OCR. It contains no applicant values and preserves source notices. It is a technical-only, non-default regression fixture, not a government service flow.

`synthetic-pmrf-acroform.pdf` is a synthetic interactive derivative, not an official fillable PMRF. The official PMRF has zero widgets. `scripts/make_pmrf_fixture.py` adds applicant-editable widgets grounded in source layout while preserving notices; this file remains a technical-only, non-default parser fixture.

| Technical synthetic snapshot | SHA-256 |
|---|---|
| `synthetic-cf1-scan.pdf` | `673cdd21f92a14163dfa225b73570ae9273fdf3824fe0564adc7712c4159477c` |
| `synthetic-pmrf-acroform.pdf` | `c52793f3c0e141a5669828aabdfe61d6a76fd0e284892b9a5472059be81d3676` |

The obsolete CF-1 semantic reference map was removed because it only described the former default claim workflow and had no runtime/test callers. `references/pmrf-reference-map.json` remains explicitly development-only; its fixed-layout metadata is corrected and its semantic candidates are not suitable as runtime mappings.
