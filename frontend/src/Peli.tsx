import type { CSSProperties } from "react";

export type PeliProps = {
  size?: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
};

/** Peli is decorative by default; supply alt text when he conveys information. */
export function Peli({
  size = 160,
  alt = "",
  className,
  style,
  loading = "lazy",
}: PeliProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}mascot/peli.png`}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={1254}
      height={1254}
      className={className}
      loading={loading}
      decoding="async"
      style={{
        display: "block",
        width: size,
        maxWidth: "100%",
        height: "auto",
        ...style,
      }}
    />
  );
}
