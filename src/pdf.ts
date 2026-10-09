import {
  PDFDocument,
  PDFName,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFSignature,
  StandardFonts,
  rgb,
} from "pdf-lib";

import type { DocumentRef, SemanticField } from "./domain";
import { isApproved } from "./domain";
export const hashBytes = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function parseDocument(
  file: File,
  role: DocumentRef["role"],
  id: string = crypto.randomUUID(),
  signal?: AbortSignal,
): Promise<{ doc: DocumentRef; fields: SemanticField[] }> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      "This file exceeds the 20 MB session limit. Choose a smaller PDF.",
    );
  signal?.throwIfAborted();
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
    throw new Error(
      "Choose a PDF document. This file does not contain a PDF header.",
    );
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
    if (!pdf.catalog || pdf.getPageCount() < 1)
      throw new Error("Missing PDF catalog or pages");
  } catch (error) {
    throw new Error(
      String(error).toLowerCase().includes("encrypt")
        ? "Password-protected PDFs are not supported. Choose an unlocked copy."
        : "This PDF could not be read. Try another copy.",
    );
  }
  const xfa = !!pdf.catalog.getAcroForm()?.dict.has(PDFName.of("XFA"));
  const all = xfa ? [] : pdf.getForm().getFields();
  const signed = all.some((f) => f instanceof PDFSignature);
  const fields: SemanticField[] = all.map((f) => {
    let kind: SemanticField["kind"] = "unsupported";
    let options: string[] | undefined;
    if (f instanceof PDFTextField) kind = "text";
    if (f instanceof PDFCheckBox) kind = "checkbox";
    if (f instanceof PDFRadioGroup) {
      kind = "radio";
      options = f.getOptions();
    }
    if (f instanceof PDFDropdown) {
      kind = f.isMultiselect() ? "unsupported" : "dropdown";
      options = f.getOptions();
    }
    if (f.isReadOnly()) kind = "unsupported";
    const value =
      f instanceof PDFTextField
        ? (f.getText() ?? "")
        : f instanceof PDFCheckBox
          ? f.isChecked()
            ? "Yes"
            : "No"
          : f instanceof PDFRadioGroup
            ? (f.getSelected() ?? "")
            : f instanceof PDFDropdown
              ? (f.getSelected()[0] ?? "")
              : "";
    return {
      id: f.getName(),
      label: f.getName().replace(/[_.]/g, " "),
      kind,
      options,
      required: f.isRequired(),
      value,
      state: value ? "user_provided" : "unresolved",
      revision: 0,
    };
  });
  // PDF.js text extraction distinguishes image-only documents without adding an OCR claim.
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  signal?.throwIfAborted();
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const abort = () => {
    void task.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  let hasText = false;
  try {
    const loaded = await task.promise;
    if (loaded.numPages > 100)
      throw new Error("This session supports PDFs of up to 100 pages.");
    for (let p = 1; p <= loaded.numPages; p++) {
      signal?.throwIfAborted();
      const page = await loaded.getPage(p);
      const text = await page.getTextContent();
      if (text.items.some((x) => "str" in x && x.str.trim())) {
        hasText = true;
        break;
      }
    }
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
  signal?.throwIfAborted();
  return {
    doc: {
      id,
      name: file.name,
      role,
      bytes,
      hash: await hashBytes(bytes),
      pages: pdf.getPageCount(),
      support: xfa
        ? "xfa"
        : signed
          ? "signed"
          : fields.length
            ? "fillable"
            : hasText
              ? "plain"
              : "image",
    },
    fields: role === "target" ? fields : [],
  };
}
const downloadUrls = new Map<string, ReturnType<typeof setTimeout>>();
export function disposeDownloadUrls() {
  for (const [url, timer] of downloadUrls) {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
  downloadUrls.clear();
}
export function download(
  bytes: Uint8Array | string,
  name: string,
  type: string,
) {
  const blob = new Blob(
    [typeof bytes === "string" ? bytes : bytes.slice().buffer],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  downloadUrls.set(
    url,
    setTimeout(() => {
      URL.revokeObjectURL(url);
      downloadUrls.delete(url);
    }, 1000),
  );
}
let exportFont: Promise<ArrayBuffer> | undefined;
const fontUrl = "/fonts/PlusJakartaSans-Regular.ttf";
export async function exportDraft(
  target: DocumentRef,
  fields: SemanticField[],
): Promise<Uint8Array> {
  if (["xfa", "signed", "image"].includes(target.support))
    throw new Error(
      "This document cannot be rewritten safely. Use an unlocked, unsigned digital PDF.",
    );
  const pdf =
    target.support === "fillable"
      ? await PDFDocument.load(target.bytes.slice(), { updateMetadata: false })
      : await PDFDocument.create();
  if (pdf.catalog.getAcroForm()?.dict.has(PDFName.of("XFA")))
    throw new Error("XFA forms cannot be rewritten safely.");
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  pdf.registerFontkit(fontkit);
  exportFont ??= fetch(fontUrl)
    .then((r) => {
      if (!r.ok)
        throw new Error(
          "The local export font could not be loaded. Reload and try again.",
        );
      return r.arrayBuffer();
    })
    .catch((error) => {
      exportFont = undefined;
      throw error;
    });
  const font = await pdf.embedFont(await exportFont, { subset: true });
  const approved = fields.filter(isApproved);
  const unreviewed = fields.filter((f) => !isApproved(f));
  const manual = approved.filter(
    (f) => f.id.startsWith("manual:") || target.support !== "fillable",
  );
  if (target.support === "fillable") {
    const form = pdf.getForm();
    for (const f of fields.filter((f) => !f.id.startsWith("manual:"))) {
      if (f.kind === "unsupported") continue;
      const widget = form.getFieldMaybe(f.id);
      if (!widget) continue;
      const value = isApproved(f) ? f.value : "";
      if (widget instanceof PDFTextField) widget.setText(value);
      else if (widget instanceof PDFCheckBox) {
        if (value === "Yes") widget.check();
        else widget.uncheck();
      } else if (widget instanceof PDFRadioGroup) {
        if (value) widget.select(value);
        else widget.clear();
      } else if (widget instanceof PDFDropdown) {
        if (value) widget.select(value);
        else widget.clear();
      }
    }
    form.updateFieldAppearances(font);
  }
  const page = pdf.addPage([595, 842]);
  let y = 785;
  const line = (text: string, size = 11) => {
    const words = text.split(/\s+/).flatMap((word) => {
      const chunks: string[] = [];
      let part = "";
      for (const glyph of word) {
        if (font.widthOfTextAtSize(part + glyph, size) > 475 && part) {
          chunks.push(part);
          part = glyph;
        } else part += glyph;
      }
      if (part) chunks.push(part);
      return chunks;
    });
    let row = "";
    for (const word of words) {
      const candidate = row ? row + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) > 475 && row) {
        pageText(row, size);
        row = word;
      } else row = candidate;
    }
    pageText(row, size);
  };
  let current = page;
  function pageText(text: string, size: number) {
    if (y < 60) {
      current = pdf.addPage([595, 842]);
      y = 785;
    }
    current.drawText(text, {
      x: 60,
      y,
      size,
      font,
      color: rgb(0.09, 0.1, 0.11),
    });
    y -= size + 9;
  }
  line("PapelLess — Draft review", 23);
  line(`Original: ${target.name}`);
  line("Prepared for your review. Not signed or submitted.");
  y -= 18;
  if (target.support === "plain")
    line("Answer sheet — the original document is unchanged.", 14);
  if (manual.length) {
    line("Reviewed answers", 15);
    for (const f of manual) {
      line(f.label, 12);
      line(f.value);
      if (f.source)
        line(`Source: page ${f.source.page} — ${f.source.quote}`, 9);
      y -= 12;
    }
  }
  if (target.support === "fillable")
    line(
      `${approved.filter((f) => !f.id.startsWith("manual:")).length} reviewed form fields included.`,
      12,
    );
  line("Unreviewed entries", 15);
  if (!unreviewed.length) line("None.");
  else
    for (const f of unreviewed)
      line(
        `${f.label}: ${f.kind === "unsupported" ? "unsupported field left unchanged" : "left blank"}.`,
        11,
      );
  return pdf.save();
}
export async function sampleDocuments(): Promise<{
  documents: DocumentRef[];
  fields: SemanticField[];
}> {
  const target = await PDFDocument.create();
  const page = target.addPage([595, 842]);
  const font = await target.embedFont(StandardFonts.Helvetica);
  const bold = await target.embedFont(StandardFonts.HelveticaBold);
  page.drawText("Community learning application", {
    x: 50,
    y: 770,
    size: 22,
    font: bold,
  });
  page.drawText("Fictional sample • For demonstration only".replace("•", "—"), {
    x: 50,
    y: 744,
    size: 10,
    font,
  });
  const definitions = [
    ["full_name", "Full name", true],
    ["present_address", "Present address", true],
    ["email", "Email address", true],
    ["preferred_contact", "Preferred contact", false],
  ] as const;
  const form = target.getForm();
  definitions.forEach(([id, label, required], i) => {
    const y = 670 - i * 115;
    page.drawText(label, { x: 50, y: y + 34, size: 12, font: bold });
    const f = form.createTextField(id);
    if (required) f.enableRequired();
    f.addToPage(page, { x: 50, y, width: 490, height: 27, borderWidth: 0.5 });
  });
  page.drawText("Review every answer before preparing a draft.", {
    x: 50,
    y: 130,
    size: 10,
    font,
  });
  const makeSupport = async (name: string, lines: string[]) => {
    const pdf = await PDFDocument.create();
    const p = pdf.addPage([595, 842]);
    const ff = await pdf.embedFont(StandardFonts.Helvetica);
    p.drawText(name, { x: 50, y: 770, size: 22, font: ff });
    p.drawText("Fictional sample record", {
      x: 50,
      y: 742,
      size: 11,
      font: ff,
    });
    lines.forEach((text, i) =>
      p.drawText(text, { x: 50, y: 670 - i * 42, size: 13, font: ff }),
    );
    return pdf.save();
  };
  const raw = [
    {
      id: "sample-target",
      name: "Community learning application.pdf",
      role: "target" as const,
      bytes: await target.save(),
      support: "fillable" as const,
    },
    {
      id: "sample-record",
      name: "Student record.pdf",
      role: "support" as const,
      bytes: await makeSupport("Student record", [
        "Full name: Alex Reyes",
        "Permanent address: 18 Acacia Street, Los Banos",
        "Preferred contact: Email",
      ]),
      support: "plain" as const,
    },
    {
      id: "sample-letter",
      name: "Residence letter.pdf",
      role: "support" as const,
      bytes: await makeSupport("Residence letter", [
        "Resident: Alex Reyes",
        "Present address: 42 Mabini Street, Los Banos",
        "Valid for the current academic term.",
      ]),
      support: "plain" as const,
    },
  ];
  const documents = await Promise.all(
    raw.map(async (r) => ({ ...r, hash: await hashBytes(r.bytes), pages: 1 })),
  );
  const fields: SemanticField[] = definitions.map(([id, label, required]) => ({
    id,
    label,
    required,
    kind: "text",
    value: "",
    state: "unresolved",
    revision: 0,
  }));
  return { documents, fields };
}
