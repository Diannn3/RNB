import { useEffect, useRef, type CSSProperties } from "react";
import { animate } from "animejs";

export type PeliProps = {
  size?: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  pose?: "rest" | "wave";
  greet?: boolean;
};

/** Peli is decorative by default; supply alt text when he conveys information. */
export function Peli({
  size = 160,
  alt = "",
  className,
  style,
  loading = "lazy",
  pose = "rest",
  greet = false,
}: PeliProps) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (!greet || !element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let greeting: ReturnType<typeof animate> | undefined;
    const stop = () => greeting?.revert();
    const start = () => {
      if (reduced.matches) return;
      greeting = animate(element, {
        keyframes: [
          { rotate: -2, duration: 180 },
          { rotate: 2, duration: 240 },
          { rotate: -1, duration: 200 },
          { rotate: 0, duration: 180 },
        ],
        ease: "out(3)",
      });
    };
    if (element.complete && element.naturalWidth) start();
    else element.addEventListener("load", start, { once: true });
    reduced.addEventListener("change", stop);
    return () => {
      element.removeEventListener("load", start);
      reduced.removeEventListener("change", stop);
      stop();
    };
  }, [greet, pose]);
  return (
    <img
      ref={image}
      src={`${import.meta.env.BASE_URL}mascot/peli${pose === "wave" ? "-wave" : ""}.png`}
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
        transformOrigin: "50% 80%",
        ...style,
      }}
    />
  );
}
