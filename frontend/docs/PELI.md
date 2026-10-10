# Peli mascot

The supplied Peli image is ready for placement, with a reusable React component.
It has not been mounted on an application page yet.

```tsx
import { Peli } from "./Peli";

// Decorative placement, hidden from assistive technology.
<Peli size={160} />

// Use descriptive text only when the image conveys information.
<Peli size={240} alt="Peli holding a paper in his pouch" />
```

- Asset: `public/mascot/peli.png`, 1254 × 1254, supplied by the user.
- Original PNG preserved unchanged, including its white background.
- Responsive width with preserved proportions; `size` defaults to 160 pixels.
- Supports `className`, `style`, and `loading="eager"` for a first-viewport use.
- No animation, external requests, placement, or page behavior is added.

For placement outside React, use `/mascot/peli.png` (or the configured Vite base).
