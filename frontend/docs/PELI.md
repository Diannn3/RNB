# Peli mascot

The supplied Peli image is ready for placement, with a reusable React component.
The waving pose is centered above “Start with a form” on the workspace welcome screen.

```tsx
import { Peli } from "./Peli";

// Decorative placement, hidden from assistive technology.
<Peli size={160} />

// Transparent waving pose with one brief greeting; static with reduced motion.
<Peli pose="wave" greet size={160} loading="eager" />

// Use descriptive text only when the image conveys information.
<Peli size={240} alt="Peli holding a paper in his pouch" />
```

- Asset: `public/mascot/peli.png`, 1254 × 1254, supplied by the user.
- Original PNG preserved unchanged, including its white background.
- Responsive width with preserved proportions; `size` defaults to 160 pixels.
- Supports `className`, `style`, and `loading="eager"` for a first-viewport use.
- `public/mascot/peli-wave.png` is a transparent imagegen edit of the supplied mascot.
- The welcome greeting uses Anime.js for one 800ms tilt, with effect cleanup.
- Reduced motion skips the greeting. Both poses remain visible without animation.
- Welcome placement and the conversation companion do not change workflow behavior.

For placement outside React, use `/mascot/peli.png` (or the configured Vite base).

## Conversation companion

`PeliFollower` places Peli above the composer's right edge using separate transparent
body and face PNG layers. The body stays fixed; GSAP moves only the eyes/beak/pouch.
Left/right face orientations crossfade, with up to 20 degrees horizontal turning,
18 degrees vertical tilt, 6px/7px parallax and 2 degrees roll. Touch and reduced-motion
modes are static. This is a layered 2.5D effect, not a 3D model.
Listeners and tweens are cleaned up on unmount; hidden tabs pause movement.
The decorative image does not intercept clicks or add keyboard stops.
The companion becomes smaller on narrow screens and hides in short mobile layouts.

## Hero peek

The user's approved hero placement puts the waving Peli behind the supporting-record
card, upright and facing the primary CTA, with his opposite raised wing visible.
Separate body/face layers preserve his direction while switching the wave.
He peeks only from the small source card, clear of the large form. The pose is lowered
16px; a clipped window hides the feet and lower body at the
card edge; card text stays unobscured. Mobile layouts reserve space above the card
and center the smaller peek. The existing GSAP hero entrance includes this decoration.
