import { useId, useRef } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  ArrowDown,
  FileText,
  Clock3,
} from "lucide-react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { Brand, PaperPreview } from "./components";
gsap.registerPlugin(SplitText, useGSAP);
export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
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
              Upload your PDF. Answer one question at a time. Check your details,
              then download your draft.
            </p>
            <div className="hero-actions">
              <Link to="/app/sample" className="button hero-primary">
                Try the sample <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <Link to="/app" className="button hero-secondary">
                Start with a form
              </Link>
            </div>
            <span className="hero-footnote">
              <span>Fictional sample. Real PDFs use manual editing.</span>
              <span>Your documents stay in this browser session.</span>
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
            <span>How it works</span>
          </a>
        </section>
        <section id="how-it-works" className="landing-steps" aria-labelledby="steps-heading">
          <h2 id="steps-heading">From a form to a finished draft.</h2>
          <ol>
            <li><h3>Upload your PDF</h3><p>Bring the form you want to complete.</p></li>
            <li><h3>Answer a question at a time</h3><p>Work through the fields in a conversation.</p></li>
            <li><h3>Check your information</h3><p>Edit your answers and preview the document before confirming.</p></li>
            <li><h3>Choose your download</h3><p>Export a PDF or an editable Word answer document.</p></li>
          </ol>
        </section>
        <section className="landing-finish" aria-labelledby="finish-heading">
          <div><h2 id="finish-heading">Your next step starts here.</h2>
            <Link to="/app" className="button hero-primary">Start with a form <ArrowRight size={19} aria-hidden="true" /></Link>
          </div>
          <div className="landing-note">
            <p>Your documents stay in this browser session.</p>
            <p>Real PDFs use manual entry. The fictional sample demonstrates evidence-linked suggestions; the AI agent is not connected yet.</p>
            <p>Nothing is signed or submitted.</p>
          </div>
        </section>
      </main>
      <footer>
        <Brand />
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
