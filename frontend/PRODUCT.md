# PapelLess

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User selected React, Vite, TypeScript, Tailwind, GSAP and Anime.js.

## Users

People preparing paperwork who need to understand unfamiliar fields and review answers against their own records.

## Product Purpose

Select an answer, reveal its source, resolve uncertainty, explicitly review, and export a draft.

## Capabilities and Constraints

Live localhost REST API under `/api/v1`, synthetic documents only, no authentication. Uploads and generated artifacts persist in the local API; conversation progress is working memory. No offline/sample/manual fallback, project restoration or Word export. Partial PDF drafts are allowed; final download requires explicit human review confirmation, invalidated by changes. Model-dependent operations require available local inference and have no remote fallback. No signatures, submission or eligibility determinations. See `../API_CONTRACT.md`.

## Brand Commitments

PapelLess name and four user-supplied PNG logos. Preserve custom letterforms. The approved plan governs the graphite showcase and bright precise workspace.

## Accessibility & Inclusion

Keyboard complete, reduced motion, responsive mobile tabs, 200% zoom, accessible names, text with semantic status colors.

## Open decisions

Production deployment and repository visibility remain undecided. The frontend uses a same-origin development proxy; production hosting must provide an equivalent proxy. Current localhost demo is not suitable for personal records.
