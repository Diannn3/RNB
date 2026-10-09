import { isApproved, type DocumentRef, type SemanticField } from "./domain";
export async function exportWord(target: DocumentRef, fields: SemanticField[], documents: DocumentRef[]) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import("docx");
  const children = [new Paragraph({ text: "PapelLess — reviewed answers", heading: HeadingLevel.TITLE }), new Paragraph({ text: target.name }), new Paragraph({ text: "An editable answer document. Not signed or submitted. Original PDF layout is not reproduced." })];
  for (const field of fields.filter(isApproved)) {
    children.push(new Paragraph({ text: field.label, heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ children: (field.value || "Not provided — explicitly left blank").split(/\r?\n/).map((text, i) => new TextRun({ text, break: i ? 1 : 0 })) }));
    if (field.source) {
      const name = documents.find((d) => d.id === field.source!.documentId)?.name;
      children.push(new Paragraph({ text: `Source: ${name ?? "Unavailable document"}, page ${field.source.page}` }));
      children.push(new Paragraph({ text: field.source.quote }));
    } else children.push(new Paragraph({ text: "Provided by you" }));
  }
  const unsupported = fields.filter((f) => f.kind === "unsupported");
  if (unsupported.length) children.push(new Paragraph({ text: `Unsupported fields left unchanged: ${unsupported.map((f) => f.label).join(", ")}` }));
  const doc = new Document({ creator: "PapelLess", title: "Reviewed paperwork answers", styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { after: 160 } } } } }, sections: [{ children }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
