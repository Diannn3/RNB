import { useId } from "react";

export default function LandingGrid({ dark = false }: { dark?: boolean }) {
  const patternId = `landing-grid-${useId().replace(/:/g, "")}`;
  return (
    <svg className={`landing-grid${dark ? " landing-grid-dark" : ""}`} width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
