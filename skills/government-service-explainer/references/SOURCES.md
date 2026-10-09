# Bundled government service knowledge sources

Demo — not official government advice

Retrieved 2026-10-09 for the original corpus; Pantawid form consulted 2026-10-10. `services.json` is an English array of concise, editorially summarized records, not an unmodified agency publication. Each record carries its exact official source URL and agency feed. Only the facts supported by the listed sources are included; the corpus is not a complete catalogue or national requirements checklist. No real applicant data is included.

| Agency | Official source and exact URL | Supported records and source location |
|---|---|---|
| DSWD | Field Office XI, HRMDD Citizen's Charter 2024 (1st Edition): https://fo11.dswd.gov.ph/wp-content/uploads/2024/05/HRMDD.pdf | Department of Social Welfare and Development acronym, full name and mandate; page 2, Mandate. |
| DSWD | AICS Program: https://aics.dswd.gov.ph/aics-program/ | Assistance to Individuals in Crisis Situations (AICS), purpose and assistance categories; English program description and objective. |
| DSWD | Field Office VIII, CIS Assistance Requirements: https://fo8.dswd.gov.ph/cis-assistance-requirements/ | Regional identification guidance and educational assistance documents; general rule and Educational Assistance section. These requirements retain their Field Office VIII scope. |
| DSWD | Pantawid Pamilyang Pilipino Program, Data Request Form: https://pantawid.dswd.gov.ph/wp-content/uploads/2020/07/PMED-Data-Request-Form.pdf | Pantawid Data Request Form; page 1 requester and organization details, purpose/data requirements, disaggregation/time frame, receipt deadline, output choices, five data-use conditions and signature/date. Official PDF extracted text matches the local `backend/demo_forms/dswd-pantawid-data-request.pdf`; the local page was also visually inspected. Byte identity was not verified. No printed version/date is shown. |
| SSS | Become an SSS Member: https://www.sss.gov.ph/become-an-sss-member/ | Agency description, membership, first-time online or branch E-Center registration, generated E-1/E-6 records; Be an SSS Member and Frequently Asked Questions sections. The FAQ explicitly distinguishes an SS number from covered membership. |
| SSS | Personal Record E-1, COV-01214 (09-2015): https://www.sss.gov.ph/wp-content/uploads/2024/10/E1-Personal-Record.pdf | E-1 purpose and sections, capital letters and black ink, N/A instructions, and lifetime SS number reminder; pages 1–2. |
| PhilHealth | Agency's Mandate and Functions: https://www.philhealth.gov.ph/about_us/mandate.php | Philippine Health Insurance Corporation (PhilHealth/PHIC), administration of the National Health Insurance Program, and distinction from direct health-care provision; Mandate and Powers and Functions. |
| PhilHealth | Members: https://www.philhealth.gov.ph/members/ | Membership overview and direct/indirect contributor groups. No individual category or benefit entitlement is determined. |
| PhilHealth | PhilHealth Member Registration Form, UHC v.1 January 2020: https://www.philhealth.gov.ph/downloads/membership/pmrf_012020.pdf | PMRF, PIN, form purposes, entry instructions, supporting identity/relationship documents and updates; pages 1–2. |

## Interpretation limits

### Field knowledge bank, checked 2026-10-10

`fields/index.json` selects four form entries: AICS GIS REV 03 (14 MAY 2024), Pantawid Data Request (no printed revision), SSS E-1 COV-01214 (09-2015), and PMRF UHC v.1 (January 2020). Each field record includes its official PDF URL through the parent entry, original source-PDF page, printed or editorial basis, owner/section, uncertainty, and protection status. Examples are authored fictional values.

The AICS source is https://fo4b.dswd.gov.ph/wp-content/uploads/2024/08/RFQ-No.-2024-08-0792-AICS-OCCI-FORMS.pdf, source page 4. Its local one-page extract was rendered and visually checked. The other sources are the exact Pantawid, E-1, and PMRF URLs listed above. Do not infer that these published snapshots are the newest policies. Read the specific entry's version and check date when explaining a field.

- The retrieval date describes when these official sources were consulted; it does not imply agency endorsement or assurance that all rules remain current.
- The E-1 PDF is an older published form. Its entry instructions are included, but its branch-submission instruction is not presented as the current first-time registration route: the SSS membership page describes mandatory online registration and branch electronic centers. Consult SSS for the appropriate current route and form.
- The PMRF PDF identifies its version as January 2020. The corpus summarizes its stable form concepts and instructions, not current contribution rates, benefit packages, or a guarantee that this version is appropriate for every transaction.
- Field Office VIII requirements are explicitly regional. They must not be generalized into a nationwide AICS checklist. Other documents depend on the assistance and responsible office.
- The Pantawid form is a program-data request, not a request for AICS, benefit enrollment or beneficiary updates. Its requested receipt deadline is not a processing deadline; the one-month feedback report is a printed condition after data use. Its published wording is not verified current data-release policy. Preserve the signature and associated attestation date blank.
- Form `document_markers` are identifying printed phrases, never filename guesses. Pantawid, E-1 and PMRF markers were confirmed in extracted PDFs. AICS GIS markers were confirmed visually on the scanned bundled page; matching that image-only form requires actual OCR text. These markers do not supply mappings or make forms default agency flows.
- No benefit amounts, contribution rates, eligibility rulings, processing deadlines, or guarantees of acceptance are included. No source authorizes this demo to sign or submit an application.
- During development the AICS program page was consulted through its original HTML because the text reader selected an empty comments RSS feed. The central `https://dswd.gov.ph/aics` URL had a certificate-fetch failure and is not used as a supporting citation.

Use the exact record URL when citing an explanation. Refer users to the responsible agency for current requirements and individual decisions. Runtime answers remain restricted to the local corpus rather than browsing these sites or filling gaps from model knowledge.
