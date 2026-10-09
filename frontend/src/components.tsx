import { Dialog } from "@base-ui/react/dialog";
import { ArrowUpRight, Check, FileText, X } from "lucide-react";
import { Link } from "react-router";
import type { ReactNode, RefObject } from "react";
export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      to="/"
      className={`brand ${dark ? "brand-dark" : ""}`}
      aria-label="PapelLess home"
    >
      <img
        src={`/brand/wordmark-${dark ? "dark" : "light"}.png`}
        alt="PapelLess"
        width="2172"
        height="724"
      />
    </Link>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className="modal" finalFocus={finalFocus}>
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="muted">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Evidence({
  quote,
  name = "Student record.pdf",
  page = 1,
  onReveal,
}: {
  quote: string;
  name?: string;
  page?: number;
  onReveal?: () => void;
}) {
  return (
    <div className="evidence">
      <div className="evidence-heading">
        <FileText size={16} />
        <span>{name}</span>
        <span className="page-label">p. {page}</span>
      </div>
      <blockquote>{quote}</blockquote>
      {onReveal && (
        <button className="text-button evidence-reveal" onClick={onReveal}>
          Show in document <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Status({
  reviewed = false,
  children,
  finalFocus,
}: {
  reviewed?: boolean;
  children: ReactNode;
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <span className={`status ${reviewed ? "reviewed" : ""}`}>
      {reviewed && <Check size={14} />} {children}
    </span>
  );
}
export function PaperPreview({
  selected = "full_name",
  onSelect,
  compact = false,
}: {
  selected?: string;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`paper-preview ${compact ? "compact" : ""}`}>
      <div className="paper-top">
        <span>Community Learning</span>
        <FileText size={19} />
      </div>
      <h3>
        Application for
        <br />a new beginning.
      </h3>
      <p className="paper-note">Fictional sample application</p>
      <div className="paper-fields">
        {[
          ["full_name", "Full name", "Alex Reyes"],
          ["present_address", "Present address", "42 Mabini Street, Los Baños"],
          ["email", "Email address", "Your answer goes here"],
        ].map(([id, label, value]) => (
          <button
            key={id}
            type="button"
            className={`paper-field ${selected === id ? "selected" : ""}`}
            onClick={() => onSelect?.(id)}
            disabled={!onSelect}
          >
            <span>{label}</span>
            <strong>{value}</strong>
            {id === "full_name" && <Check size={15} />}
          </button>
        ))}
      </div>
      <div className="paper-bottom">
        <span>For your review</span>
        <span>1 / 1</span>
      </div>
    </div>
  );
}
