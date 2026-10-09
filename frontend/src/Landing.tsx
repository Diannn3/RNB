import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  ArrowDown,
  Check,
  FileText,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import SignatureSequence from "./SignatureSequence";
import { Brand, Evidence, PaperPreview } from "./components";
gsap.registerPlugin(ScrollTrigger, Flip, SplitText, useGSAP);
export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const [selected, setSelected] = useState("full_name");
  const [approved, setApproved] = useState(false);
  const [answer, setAnswer] = useState("");
  const [saved, setSaved] = useState(false);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = SplitText.create(".hero h1", {
          type: "lines",
          autoSplit: true,
          mask: "lines",
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 105,
              duration: 0.55,
              stagger: 0.08,
              ease: "expo.out",
              clearProps: "transform",
            }),
        });
        gsap.from(".hero-art", {
          y: 12,
          duration: 0.65,
          ease: "expo.out",
          clearProps: "transform",
        });
        return () => split.revert();
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  useGSAP(
    () => {
      if (
        flipState.current &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const animation = Flip.from(flipState.current, {
          duration: 0.45,
          ease: "expo.out",
        });
        flipState.current = null;
        return () => animation.kill();
      }
    },
    { scope: root, dependencies: [selected] },
  );
  const choose = (id: string) => {
    flipState.current = Flip.getState(
      root.current!.querySelector(".interactive-paper")!,
    );
    setSelected(id);
    setApproved(false);
    setSaved(false);
  };
  const quote =
    selected === "full_name"
      ? "Full name: Alex Reyes"
      : selected === "present_address"
        ? "Present address: 42 Mabini Street, Los Banos"
        : "This detail is missing from the sample records.";
  return (
    <div ref={root} className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <LandingGrid />
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link to="/app" className="nav-launch">
            Open workspace <ArrowUpRightIcon />
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="hero">
          <LandingGrid />
          <div className="hero-copy">
            <h1>
              Make sense <br />
              of forms.
            </h1>
            <p>
              Your documents hold the answers. Bring them together. Review every detail.
              Leave with a draft that makes sense.
            </p>
            <div className="hero-actions">
              <Link to="/app" className="button hero-primary">
                Open workspace <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <Link to="/app" className="button hero-secondary">
                Start with a form
              </Link>
            </div>
            <span className="hero-footnote">
              <span>Synthetic documents only. Illustrations are fictional.</span>
              <span>Uploads persist in the local API. No remote fallback.</span>
            </span>
          </div>
          <div className="hero-art" role="group" aria-label="Fictional preview: form, supporting record, and pending review">
            <div className="hero-paper">
              <PaperPreview />
            </div>
            <div className="hero-context">
              <div className="hero-record">
                <span>
                  <FileText size={16} aria-hidden="true" /> Student record.pdf
                </span>
                <p>Supporting passage</p>
                <blockquote>Full name: Alex Reyes</blockquote>
                <div className="record-line" />
                <small>Fictional sample. Page 1.</small>
              </div>
              <div className="hero-review">
                <span className="review-icon" aria-hidden="true">
                  <Clock3 size={20} />
                </span>
                <div>
                  <strong>Alex Reyes</strong>
                  <span>Ready for your review</span>
                </div>
              </div>
            </div>
          </div>
          <a href="#how-it-works" className="scroll-cue">
            <ArrowDown size={18} />
            <span>Follow an answer</span>
          </a>
        </section>
        <SignatureSequence />
        <section className="interactive-section">
          <LandingGrid />
          <div className="section-heading">
            <h2>
              A little clarity.
              <br />A lot less guesswork.
            </h2>
            <p>
              Select a field. Read its source.
              <br />
              The final answer is always yours.
            </p>
          </div>
          <div className="interactive-demo">
            <div
              className="interactive-paper"
              style={{
                transform: `rotate(${selected === "present_address" ? 2 : selected === "email" ? 0 : -3}deg)`,
              }}
            >
              <PaperPreview selected={selected} onSelect={choose} />
            </div>
            <div className="interactive-review">
              <span className="sample-label">Fictional sample</span>
              <h3>
                {selected === "full_name"
                  ? "Full name"
                  : selected === "present_address"
                    ? "Present address"
                    : "One detail only you know."}
              </h3>
              {selected === "email" ? (
                <>
                  <p>What email address would you like to use?</p>
                  <label htmlFor="demo-email">Email address</label>
                  <input
                    id="demo-email"
                    type="email"
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      setSaved(false);
                    }}
                    placeholder="you@example.com"
                  />
                  <button
                    className="button primary"
                    disabled={
                      !answer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)
                    }
                    onClick={() => setSaved(true)}
                  >
                    {saved ? "Answer saved" : "Save answer"} <Check size={17} />
                  </button>
                </>
              ) : (
                <>
                  <div className="demo-answer">
                    {selected === "full_name"
                      ? "Alex Reyes"
                      : "42 Mabini Street, Los Baños"}
                  </div>
                  <Evidence
                    quote={quote}
                    name={
                      selected === "full_name"
                        ? "Student record.pdf"
                        : "Residence letter.pdf"
                    }
                  />
                  <p className="muted">
                    {selected === "present_address"
                      ? "A permanent address can differ from where you live now. Read the context before choosing."
                      : "The record supports this suggestion. You decide whether to use it."}
                  </p>
                  <button
                    className={`button ${approved ? "approved-button" : "primary"}`}
                    onClick={() => setApproved(!approved)}
                  >
                    <Check size={17} />
                    {approved ? "Reviewed by you" : "Review this answer"}
                  </button>
                </>
              )}
              <p className="demo-feedback" aria-live="polite">
                {saved
                  ? "Your answer is saved in this demonstration."
                  : approved
                    ? "Illustrative review only. Open the workspace for a live draft."
                    : " "}
              </p>
            </div>
          </div>
        </section>
        <section className="closing">
          <LandingGrid dark />
          <div className="closing-copy">
            <h2>
              Less paperwork.
              <br />
              More forward.
            </h2>
            <p>A draft you can read, correct, and make your own.</p>
            <Link to="/app" className="button light">
              Start with a form <ArrowRight size={19} />
            </Link>
          </div>
          <div className="capabilities">
            <ShieldCheck size={26} />
            <h3>Room for your judgment.</h3>
            <p>
              Upload synthetic PDFs to the local API to inspect evidence,
              resolve conflicts, and prepare a draft.
            </p>
            <p>
              Partial drafts are allowed. Confirm your review before downloading a PDF.
              Nothing is signed or submitted.
            </p>
            <Link to="/app" className="text-button">
              Open the workspace <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <footer>
        <LandingGrid dark />
        <Brand dark />
        <span>Prepared by PapelLess. Reviewed by you.</span>
        <a href="#main">
          Back to top <ArrowUpRightIcon />
        </a>
      </footer>
    </div>
  );
}
function LandingGrid({ dark = false }: { dark?: boolean }) {
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
function ArrowUpRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  );
}
