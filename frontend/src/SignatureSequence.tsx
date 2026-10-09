import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, FileText } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Evidence } from "./components";
const SampleDraft = lazy(() => import("./SampleDraft"));
gsap.registerPlugin(ScrollTrigger, useGSAP);
const steps = ["Blank field", "Source", "Suggestion", "Your review", "Draft"];
export default function SignatureSequence() {
  const root = useRef<HTMLElement>(null);
  const [cinematic, setCinematic] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const q = matchMedia(
      "(min-width: 1201px) and (prefers-reduced-motion: no-preference)",
    );
    const update = () => {
      setCinematic(q.matches);
      setActive(0);
    };
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  useGSAP(
    () => {
      if (!cinematic) return;
      const phases = gsap.utils.toArray<HTMLElement>(".signature-phase");
      gsap.set(phases, { autoAlpha: 0, y: 18 });
      gsap.set(phases[0], { autoAlpha: 1, y: 0 });
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "+=1600",
          pin: ".signature-inner",
          scrub: 0.35,
        },
        onUpdate: () => {
          const time = timeline.time();
          let index = 0;
          for (let i = 1; i < steps.length; i++)
            if (time >= timeline.labels[`step-${i}`]) index = i;
          setActive(index);
        },
      });
      timeline.addLabel("step-0").to({}, { duration: 0.8 });
      for (let i = 1; i < phases.length; i++) {
        timeline
          .to(phases[i - 1], { autoAlpha: 0, y: -14, duration: 0.18 })
          .addLabel(`step-${i}`)
          .fromTo(
            phases[i],
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: 0.32 },
          )
          .to({}, { duration: 0.8 });
      }
    },
    { scope: root, dependencies: [cinematic], revertOnUpdate: true },
  );
  return (
    <section
      ref={root}
      className={`signature signature-story ${cinematic ? "signature-cinematic" : ""}`}
      id="how-it-works"
    >
      <div className="signature-inner">
        <div className="signature-copy">
          <h2>
            Every answer
            <br />
            has a story.
          </h2>
          <p>
            Follow it back to the source.
            <br />
            See what fits. Decide what belongs.
          </p>
          <p className="signature-disclosure">
            A fictional walkthrough, from an empty field to a draft.
          </p>
          <ol
            className="signature-steps"
            aria-label="Answer to draft progression"
          >
            {steps.map((step, i) => (
              <li
                key={step}
                aria-current={cinematic && active === i ? "step" : undefined}
              >
                {step}
              </li>
            ))}
          </ol>
          <Link to="/app/sample" className="text-button">
            Explore the sample <ArrowRight size={17} />
          </Link>
        </div>
        <div className="signature-phases">
          <article
            className="signature-phase"
            aria-hidden={cinematic && active !== 0}
            inert={cinematic && active !== 0}
          >
            <div className="story-page">
              <div className="story-page-top">
                <FileText size={19} />
                <span>Community learning application</span>
              </div>
              <h3>
                Start with a<br />
                blank field.
              </h3>
              <p>Full name</p>
              <div className="story-field empty">Your answer goes here</div>
              <p className="story-caption">
                A field is waiting. Your records may hold the answer.
              </p>
            </div>
          </article>
          <article
            className="signature-phase"
            aria-hidden={cinematic && active !== 1}
            inert={cinematic && active !== 1}
          >
            <div className="story-page">
              <h3>Read the original.</h3>
              <p>One passage. One record. An answer you can trace.</p>
              <Evidence quote="Full name: Alex Reyes" />
              <p className="story-caption">
                Exact words from the fictional supporting record, page 1.
              </p>
            </div>
          </article>
          <article
            className="signature-phase"
            aria-hidden={cinematic && active !== 2}
            inert={cinematic && active !== 2}
          >
            <div className="story-page">
              <h3>
                A suggestion,
                <br />
                with its source.
              </h3>
              <p>Full name</p>
              <div className="story-field proposed">Alex Reyes</div>
              <Evidence quote="Full name: Alex Reyes" />
              <p className="story-caption">
                The record supports a proposed answer. It still needs your
                review.
              </p>
            </div>
          </article>
          <article
            className="signature-phase"
            aria-hidden={cinematic && active !== 3}
            inert={cinematic && active !== 3}
          >
            <div className="story-page">
              <h3>
                Your judgment
                <br />
                comes next.
              </h3>
              <p>Read, correct, then explicitly approve.</p>
              <div className="story-field">Alex Reyes</div>
              <div className="story-reviewed">
                <Check size={18} />
                <span>Reviewed by you</span>
              </div>
              <p className="story-caption">
                The illustrated review comes from a person. Documentary support
                and approval are separate.
              </p>
            </div>
          </article>
          <article
            className="signature-phase"
            aria-hidden={cinematic && active !== 4}
            inert={cinematic && active !== 4}
          >
            <div className="story-page">
              <h3>
                A draft.
                <br />
                Ready to read.
              </h3>
              <p>Full name</p>
              <div className="story-field">Alex Reyes</div>
              <p className="story-caption">
                Reviewed entries are included. Unreviewed entries remain blank.
                Nothing is signed or submitted.
              </p>
              <Suspense fallback={<p>Opening draft controls…</p>}>
                <SampleDraft />
              </Suspense>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
