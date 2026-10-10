import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/** Layered face rig; the body stays fixed in its reserved composer-side space. */
export function PeliFollower() {
  const mascot = useRef<HTMLDivElement>(null);
  const leftFace = useRef<HTMLImageElement>(null);
  const rightFace = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = mascot.current;
    if (!element) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
      const options = { duration: 0.45, ease: "expo.out" };
      const xTo = gsap.quickTo(element, "x", options);
      const yTo = gsap.quickTo(element, "y", options);
      const turnTo = gsap.quickTo(element, "rotationY", options);
      const nodTo = gsap.quickTo(element, "rotationX", options);
      const tiltTo = gsap.quickTo(element, "rotation", options);
      const leftTo = gsap.quickTo(leftFace.current, "opacity", { duration: 0.18 });
      const rightTo = gsap.quickTo(rightFace.current, "opacity", { duration: 0.18 });
      const motion = [xTo, yTo, turnTo, nodTo, tiltTo];
      const rest = () => { motion.forEach(to => to(0)); leftTo(0); rightTo(1); };
      const follow = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || document.hidden) return;
        const bounds = element.parentElement!.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const dx = Math.max(-1, Math.min(1, (event.clientX - centerX) / Math.max(1, event.clientX < centerX ? centerX : innerWidth - centerX)));
        const dy = Math.max(-1, Math.min(1, (event.clientY - centerY) / Math.max(1, event.clientY < centerY ? centerY : innerHeight - centerY)));
        xTo(dx * 6);
        yTo(dy * 7);
        turnTo(dx * 20);
        nodTo(-dy * 18);
        tiltTo(dx * 2);
        leftTo(dx < -0.03 ? 1 : 0);
        rightTo(dx < -0.03 ? 0 : 1);
      };
      const leave = (event: PointerEvent) => { if (!event.relatedTarget) rest(); };
      const visibility = () => {
        if (document.hidden) {
          [...motion, leftTo, rightTo].forEach(to => to.tween.pause());
          gsap.set(element, { x: 0, y: 0, rotation: 0, rotationX: 0, rotationY: 0 });
          gsap.set(leftFace.current, { opacity: 0 });
          gsap.set(rightFace.current, { opacity: 1 });
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
    <div className="api-peli-follower">
      <img className="api-peli-body" src={`${import.meta.env.BASE_URL}mascot/peli-body.png`} width={1254} height={1254} alt="" draggable={false} />
      <div ref={mascot} className="api-peli-gaze">
        <img ref={rightFace} className="api-peli-face" src={`${import.meta.env.BASE_URL}mascot/peli-face.png`} width={1254} height={1254} alt="" draggable={false} />
        <img ref={leftFace} className="api-peli-face api-peli-face-left" src={`${import.meta.env.BASE_URL}mascot/peli-face.png`} width={1254} height={1254} alt="" draggable={false} />
      </div>
    </div>
  </div>;
}
