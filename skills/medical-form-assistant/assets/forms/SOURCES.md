# Bundled PhilHealth source files

Retrieved 2026-10-09. These PDFs are unmodified source copies fetched from the official URLs below; the source files' notices are retained. PhilHealth forms carry a no-sale notice. Commercial use and commercial distribution are not approved; this manifest does not grant a more permissive license.

| File | Source URL | SHA-256 |
|---|---|---|
| `philhealth-cf1-092018.pdf` | https://www.philhealth.gov.ph/downloads/claim/ClaimForm1_092018.pdf | `66faacded5460032eb420018162a836df9d8c914e6b1fae5bd73fdf689883b67` |
| `philhealth-pmrf-012020.pdf` | https://www.philhealth.gov.ph/downloads/membership/pmrf_012020.pdf | `26d572088d280e7e42b4174c92a950e166ef2828481f09a4f85b808e807ced01` |
| `philhealth-annexb-pdr-hf-230804-fillable.pdf` | https://www.philhealth.gov.ph/downloads/accreditation/ANNEXB_PDR-HF-230804_FILLABLE.pdf | `f915484b24a27a2cb47f50a01d4b4477391fef1c856f850bb35e80a38ea907b5` |

## Synthetic demo derivatives

`synthetic-cf1-scan.pdf` rasterizes the unchanged official CF-1 at 1.5× scale using PDFium and embeds the page image in a PDF for printed-English OCR. It contains no patient values; source notices remain visible.

`synthetic-pmrf-acroform.pdf` is a synthetic interactive derivative, not an official fillable PMRF. The official source above contains zero AcroForm widgets. The generator in `scripts/make_pmrf_fixture.py` adds only patient-editable widgets grounded in extracted source layout and preserves the original notices.
