import { useRef, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
export type VerificationTab = "Document" | "Review";
export default function VerificationPage({ tab, onTab, documentPane, reviewPane }: {
  tab: VerificationTab; onTab: (tab: VerificationTab) => void;
  documentPane: ReactNode; reviewPane: ReactNode;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return <>
    <div className="mobile-tabs" role="tablist" aria-label="Verification view">
      {(["Document", "Review"] as VerificationTab[]).map((t, i) => <button key={t} ref={(node) => { tabs.current[i] = node; }} id={`workspace-tab-${t.toLowerCase()}`} aria-controls={t === "Document" ? "workspace-document" : "workspace-review"} role="tab" aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} onClick={() => onTab(t)} onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - i;
        tabs.current[next]?.click(); tabs.current[next]?.focus();
      }}>{t === "Document" ? "Preview" : "Answers"}</button>)}
    </div>
    <div className="desktop-panes"><Group orientation="horizontal" id="workspace-panes"><Panel defaultSize="55%" minSize="35%">{documentPane}</Panel><Separator className="pane-separator" aria-label="Resize document and review panes" /><Panel minSize="35%">{reviewPane}</Panel></Group></div>
  </>;
}
