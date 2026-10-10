import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Peli } from "./Peli";

/** Decorative companion; motion stays inside its reserved composer-side space. */
export function PeliFollower() {
  const mascot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = mascot.current;
    if (!element) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
      const options = { duration: 0.45, ease: "expo.out" };
      const xTo = gsap.quickTo(element, "x", options);
      const yTo = gsap.quickTo(element, "y", options);
      const tiltTo = gsap.quickTo(element, "rotation", options);
      const rest = () => { xTo(0); yTo(0); tiltTo(0); };
      const follow = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || document.hidden) return;
        const bounds = element.parentElement!.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const dx = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / 300));
        const dy = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / 250));
        xTo(dx * 10);
        yTo(dy * 7);
        tiltTo(dx * 4);
      };
      const leave = (event: PointerEvent) => { if (!event.relatedTarget) rest(); };
      const visibility = () => {
        if (document.hidden) {
          xTo.tween.pause(); yTo.tween.pause(); tiltTo.tween.pause();
          gsap.set(element, { x: 0, y: 0, rotation: 0 });
        }
      };
      window.addEventListener("pointermove", follow, { passive: true });
      window.addEventListener("pointerout", leave);
      window.addEventListener("blur", rest);
      document.addEventListener("visibilitychange", visibility);
      return () => {
        window.removeEventListener("pointermove", follow);
        window.removeEventListener("pointerout", leave);
        window.removeEventListener("blur", rest);
        document.removeEventListener("visibilitychange", visibility);
      };
    });
    return () => media.revert();
  }, []);
  return <div className="api-peli-perch" aria-hidden="true">
    <div ref={mascot} className="api-peli-follower"><Peli pose="wave" size={104} loading="eager" /></div>
  </div>;
}
