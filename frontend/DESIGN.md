---
name: PapelLess
description: Existing visual contract with the approved paper light hero and header.
colors:
  ink: "#17191c"
  paper: "#fafaf8"
  white: "#ffffff"
  muted: "#62666d"
  border: "#e0e2e5"
  graphite: "#111214"
  blue: "#315dba"
  amber: "#805016"
  green: "#24634b"
  hero-surface: "#f2f3f1"
  hero-glass: "rgb(255 255 255 / 82%)"
  hero-panel-border: "#d9dde0"
  focus: "#507dd3"
typography:
  body:
    fontFamily: "Plus Jakarta Sans Variable, sans-serif"
    fontWeight: 400
  hero-display:
    fontFamily: "Plus Jakarta Sans Variable, sans-serif"
    fontSize: "clamp(56px, 6.6vw, 92px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  hero-body:
    fontFamily: "Plus Jakarta Sans Variable, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.8
  hero-action:
    fontFamily: "Plus Jakarta Sans Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  hero-source:
    fontFamily: "Plus Jakarta Sans Variable, sans-serif"
    fontSize: "19px"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  hero-control: "10px"
  hero-panel: "12px"
spacing:
  hero-control-gap: "12px"
  hero-panel-gap: "20px"
  hero-gutter: "24px"
components:
  hero-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.hero-action}"
    rounded: "{rounded.hero-control}"
    padding: "13px 18px"
  hero-secondary:
    backgroundColor: "{colors.hero-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.hero-action}"
    rounded: "{rounded.hero-control}"
    padding: "13px 18px"
  header-navigation:
    textColor: "{colors.ink}"
    size: "14px"
  hero-source-panel:
    backgroundColor: "{colors.hero-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hero-panel}"
    padding: "20px"
  hero-review-panel:
    backgroundColor: "{colors.hero-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hero-panel}"
    padding: "18px"
---

# PapelLess visual contract

## Overview

**Creative North Star: "Paper light hero and header"**

This approved update records the implemented landing hero and header only. Paper surfaces, ink typography, shallow paired shadows, and bounded glass panels make the fictional form, source, and pending review readable in the first viewport. The supplied black PNG wordmark keeps its custom letterforms; the hero uses no mascot.

The following incumbent contract remains in force for the lower showcase and document workspace. The new hero materials do not redefine their component systems.

**Key Characteristics:**

- Paper light hero and header with local Plus Jakarta Sans.
- Upright shared form beside a source and neutral pending review rail.
- Shallow paired shadows and bounded glass with an opaque fallback.
- Responsive stacking and native scrolling.

### Preserved incumbent contract

Approved through the user's implementation request, October 9, 2026.
Showcase: Persuade. Workspace: Operate. Actual logos, locally hosted Plus Jakarta Sans, graphite #111214, paper #FAFAF8, white, ink #17191C, muted #62666D, borders #E0E2E5. Blue means evidence selected; amber means attention; green means reviewed, each with text.
First viewport: oversized headline beside a legible fictional paper form, supporting passage, and answer review. Demonstrate the mechanism immediately. One authored document-to-evidence-to-review sequence. Native scrolling, no forced loaders or cursor replacement.
Workspace: quiet two-pane document/review composition, optional resizable separator. Narrow screens use Document / Review / Questions tabs. Review at 1366x768 and 200% zoom.
GSAP owns showcase motion; Anime owns workspace microinteractions. Neither animates the other's elements. Reduced motion uses readable static narrative. All authored document data is fictional and labeled.
No headline eyebrows, invented metrics, testimonials, decorative dots, repetitive icon tiles or generic feature-card grid. Brand gradients belong only to the supplied logos.

User revision October 9: workspace defaults to light, with an explicit header dark-mode toggle. Theme stays during stage navigation in this session; refresh returns to light. PDF pages retain paper colors. Showcase remains the approved graphite composition.

## Colors

The frontmatter is normative. Existing semantic colors and the lower showcase graphite are retained; hero-specific surface tokens describe this approved section only.

### Primary

Ink anchors the hero headline, primary action, header navigation, and review answer. The primary action pairs ink with white text.

### Neutral

Paper is the hero and header ground. Muted text carries supporting copy and metadata. Border separates controls; hero panel border contains source and review panels. Hero surface is the pale raised secondary action and workspace link. Hero glass is used only where backdrop filtering is supported; white is the opaque fallback.

**The Pending Review Rule.** The hero review remains neutral and says "Ready for your review"; green continues to mean reviewed, with text.

## Typography

The locally hosted Plus Jakarta Sans Variable supplies display and body typography, with the existing sans-serif fallback. The hero preserves the explicit two-line headline: "Make sense" / "of forms." The supplied PNG wordmark is an image asset, not typeset text.

The desktop hero display, supporting copy, action, and source quote use the frontmatter roles. At the hero stack breakpoint the display becomes `clamp(48px, 8vw, 80px)`; at the mobile breakpoint it becomes `clamp(42px, 11vw, 64px)`, and supporting copy becomes 16px. Header navigation is 14px on desktop and 12px on mobile. Source metadata and review status remain 12px; the review answer is 14px at weight 700 and line-height 1.5. Footnotes use 12px with line-height 1.7.

## Layout

The header and hero use full-width paper backgrounds with inline padding `max(24px, calc((100% - 1240px) / 2))`. Header minimum height is 88px, with 16px block padding; it can grow with content. The desktop hero uses columns `0.9fr / 1.1fr`, gaps of 28px vertically and 44px horizontally, and minimum height `calc(100svh - 88px)` without a fixed maximum height.

The hero art is an upright, non-overlapping composition: shared form on the left, source and pending review stacked in a rail on the right. Art columns are `1fr / 0.68fr`, with a 20px gap. The shared paper preview and its fields are retained. The scroll cue occupies its own flow row.

- At 1100px and below, the hero stacks copy above art; the art is centered with a 650px maximum width, and the hero has no viewport minimum height.
- At 600px and below, art and rail become one column with 24px and 16px gaps respectively. Inline gutters stay 24px. Header minimum height becomes 80px, navigation can wrap, and "How it works" is hidden while "Open workspace" remains available.
- At 380px and below, the header wordmark viewport reduces to 112 by 32px; its supplied PNG is cropped at the existing aspect ratio, never redrawn.

**The Neutral Grid Rule.** The existing landing grid repeats every 48px with a 1px stroke and 0.1 opacity. Each header, landing section, and footer owns its non-interactive grid; light sections use ink and dark sections use paper. This approved grid treatment is the only shared landing decoration recorded by this update.

### Approved annotation corrections — October 9, 2026

The landing wordmark viewport is 160px wide (112px in the smallest header). Image offsets crop only empty asset margins; all supplied letterforms remain visible. The footer establishes its graphite backdrop and uses a lightening blend to remove the supplied dark logo's black matte visually, preserving the original PNG and its silver lettering.

The narrative document and evidence panel use normal grid flow with a 56px minimum layout gap. At 1200px and below, narrative copy stacks above the cards and the sequence stays static. At 800px and below, the cards stack vertically. A cubic curve connects their measured edges, updates on resize and GSAP movement, and changes orientation with the layout. Desktop scroll motion starts above 1200px; reduced motion keeps the complete static connector visible. Shared form contents and interactive demo behavior remain unchanged.

## Elevation & Depth

The hero uses shallow paired shadows: a soft ink shadow down and right, plus a white highlight up and left. Secondary and header launch controls share the raised shadow; source and review share the panel shadow. The primary action and paper retain their distinct paired shadows, recorded exactly in the sidecar.

**The Bounded Glass Rule.** Only source and review panels use white at 82% opacity and a 12px backdrop blur, gated by feature support. Their default is opaque white with a visible panel border. Glass does not extend to the full hero, header, or shared form.

Hero motion keeps the implemented GSAP line reveal (0.55s duration, 0.08s stagger, `expo.out`) and subtle art entrance (12px rise over 0.65s). Action states use the existing 0.18s transition, a 1px hover lift, and a 1px active press. Reduced motion renders the narrative statically and uses the existing near-instant transition override.

## Shapes

Hero actions and header launch use gently curved 10px corners. Source and review panels use 12px corners and a 1px border. The pending clock indicator is a neutral 34px square with 10px corners. The upright form retains the shared paper preview's shape and content.

## Components

### Buttons

"Open workspace" is the ink primary action linking to `/app`; "Start with a form" is the raised pale secondary action also linking to `/app`. The former sample entry has been removed for the live API cutover. Both use the frontmatter action typography, 13px by 18px padding, and a 48px minimum height. Actions wrap as needed. Primary hover uses `#34373c`; secondary hover uses `#e9ebe7`. Keyboard focus retains the shared 3px focus outline with a 4px offset.

### Navigation

The supplied black wordmark links home with an accessible name. "How it works" links to the existing mechanism section; "Open workspace" links to `/app` and uses the raised secondary material with 11px by 16px padding on desktop and 10px by 12px on mobile. Navigation links have a 44px minimum target height, underline on hover, and the shared keyboard focus outline.

### Source and review panels

The source panel shows "Student record.pdf", "Supporting passage", the quote "Full name: Alex Reyes", and fictional page metadata. The review panel shows "Alex Reyes", a neutral clock, and "Ready for your review". They use the bounded glass material and shared panel shadow. These are illustrative preview panels, with no hover or press state. Decorative icons and the grid are hidden from assistive technology; the art group names the fictional preview and pending review.

## Do's and Don'ts

### Do:

- **Do** preserve the supplied black PNG wordmark and locally hosted Plus Jakarta Sans in the hero and header.
- **Do** keep the two-line hero heading and the "Open workspace" primary / "Start with a form" secondary hierarchy.
- **Do** keep the shared form upright and the source and pending review panels legible in normal document flow.
- **Do** retain the bounded glass fallback, neutral grid, visible focus, and reduced-motion behavior.
- **Do** keep the incumbent lower-section and workspace visual contract in force.

### Don't:

- **Don't** add a mascot to the hero or redraw the supplied wordmark.
- **Don't** present the hero's pending review as a completed green approval.
- **Don't** extend the hero glass, paired shadows, or responsive composition into workspace components as a new global rule.

## Live API interaction contract

The landing's fictional form, source and five-stage GSAP story remain illustrative only; they do not initialize a sample workspace or generate sample downloads. Entry links lead to `/app`. Copy states synthetic-only use, local API persistence and no remote fallback.

The quiet light/dark workspace uses the live API contract for uploads, structure, grounded source-slot edits, conversation, comparison, corpus explanations, draft PNG preview and PDF-only export. Partial drafts may have missing fields; show those fields and require explicit human review confirmation before download. Changes invalidate confirmation. There is no manual/offline fallback, browser project restore or Word export. Documents are transmitted to the local API and persisted there; do not claim browser-only privacy.

Live workspace typography retains the incumbent scale: 13px metadata, 14px secondary copy, 16px inputs/body, 22px section headings, 28–38px pane headings, and 32–48px start heading. Controls retain the existing 7px radius; question panels use 12px. These workspace steps do not redefine the landing hero. Draft review offers both the first-page PNG and a full multipage PDF viewer before confirmation.

