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
- Placement is limited to the welcome screen; workflow behavior is unchanged.

For placement outside React, use `/mascot/peli.png` (or the configured Vite base).
