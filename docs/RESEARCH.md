# Research-to-implementation decisions

Freshness boundary: October 9, 2026. The approved plan reports 38 GitHub candidates, 39 package records, 16 READMEs, 12 issue threads, 38 substantive reference/documentation pages and five visually inspected sites. These overlapping categories are not a unique source total or a new research pass performed during implementation.

## Applied references

- [Linear](https://linear.app/): typography and restrained hierarchy.
- [Craft](https://www.craft.do/): document-centered composition.
- [Superlist](https://www.superlist.com/): deliberate storytelling transitions.
- [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/): correction and confirmation.
- [Microsoft human-AI guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/): capabilities and uncertainty.
- [Google PAIR](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/): progressive explanation.
- [GSAP React](https://gsap.com/resources/React/) and [Anime.js React scopes](https://animejs.com/documentation/getting-started/using-with-react/): ownership, cleanup and reduced motion.
- [React-PDF](https://github.com/wojtekmaj/react-pdf): local matching worker. Installed React-PDF 11 uses PDF.js 6.3.289, whose worker/CMaps/fonts/WASM are bundled locally.
- [pdf-lib forms](https://pdf-lib.js.org/docs/api/classes/pdfform): supported widgets and XFA limitations. Inspection must check the raw catalog before getForm, which can remove XFA.

Versions are pinned in package.json and package-lock.json; licensing is inventoried in THIRD_PARTY_NOTICES.md. Base UI supplies dialog/tabs accessibility behavior. All visual styling is owned in this repository. No copied React Bits/Magic UI component or additional motion engine is installed.

Brand images are unchanged copies of the supplied assets. Plus Jakarta Sans is self-hosted; OFL text accompanies the font. Impeccable's mechanical detector warned that this font is commonly used; the explicitly approved font choice was retained.
