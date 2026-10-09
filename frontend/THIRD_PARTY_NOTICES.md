# Dependencies and assets

Direct dependency inventory updated for the live API cutover, October 10, 2026. The lockfile records transitive dependencies. See each package LICENSE for actual terms; this inventory is not legal advice.

| Package                                | Installed version | Declared license                                                 |
| -------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| @axe-core/playwright                   | 4.13.0            | MPL-2.0                                                          |
| @base-ui/react                         | 1.9.0             | MIT                                                              |
| @fontsource-variable/manrope | 5.3.0 | OFL-1.1 |
| @fontsource-variable/atkinson-hyperlegible-next | 5.3.0 | OFL-1.1 |
| @gsap/react                            | 2.1.2             | SEE LICENSE AT https://gsap.com/standard-license                 |
| @playwright/test                       | 1.64.0            | Apache-2.0                                                       |
| @tailwindcss/vite                      | 4.3.3             | MIT                                                              |
| @types/node                            | 26.6.4            | MIT                                                              |
| @types/react                           | 19.3.0            | MIT                                                              |
| @types/react-dom                       | 19.3.0            | MIT                                                              |
| @vitejs/plugin-react                   | 6.1.2             | MIT                                                              |
| animejs                                | 4.5.0             | MIT                                                              |
| gsap                                   | 3.15.0            | Standard 'no charge' license: https://gsap.com/standard-license. |
| lucide-react                           | 1.54.0            | ISC                                                              |
| react                                  | 19.3.0            | MIT                                                              |
| react-dom                              | 19.3.0            | MIT                                                              |
| react-pdf                              | 11.0.0            | MIT                                                              |
| react-router                           | 8.4.0             | MIT                                                              |
| tailwindcss                            | 4.3.3             | MIT                                                              |
| typescript                             | 7.0.2             | Apache-2.0                                                       |
| vite                                   | 8.3.4             | MIT                                                              |
| vitest                                 | 5.0.3             | MIT                                                              |

## Assets

The four logo originals were supplied and selected by the user. Product use does not grant general redistribution rights. Three display assets are copied unchanged into public/brand; the unused white mark is also preserved there.

Manrope and Atkinson Hyperlegible Next: locally bundled variable WOFF2 via Fontsource, SIL OFL 1.1; licenses included in their npm packages. Historical Plus Jakarta Sans TTF assets retain the license at public/fonts/OFL.txt.

PDF.js CMaps, standard fonts and WASM are copied from the installed renderer dependency. Their upstream license files remain beside the assets. PDF worker is built from that same dependency version.

GSAP uses its Standard License, not MIT. React Bits and Magic UI informed research only; no component source was copied. No Motion or Three.js dependency was added.

## Conversational interview addition

The browser Word exporter and its `docx` dependency were removed in the live API cutover. Typebot (FSL), SPACE10 Conversational Form, assistant-ui, Vercel Chatbot and React Chatbot Kit were workflow references only; no source was copied and none was installed.
