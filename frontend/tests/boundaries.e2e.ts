import { test, expect } from "@playwright/test";
import { start, complete, answer } from "./helpers";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
async function document(
  kind:
    | "signed"
    | "xfa"
    | "image"
    | "encrypted"
    | "prefilled"
    | "support" = "prefilled",
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  if (kind !== "image") {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(
      kind === "support" ? "Full name: Alex Reyes" : "Digital form",
      { x: 50, y: 750, size: 14, font },
    );
  }
  const form = pdf.getForm();
  if (kind === "prefilled" || kind === "signed") {
    const f = form.createTextField("name");
    f.addToPage(page, { x: 50, y: 650, width: 400, height: 30 });
    if (kind === "signed")
      f.acroField.dict.set(PDFName.of("FT"), PDFName.of("Sig"));
    else f.setText("Existing answer");
  }
  if (kind === "xfa")
    form.acroForm.dict.set(PDFName.of("XFA"), PDFString.of("<xfa/>"));
  if (kind === "encrypted")
    pdf.context.trailerInfo.Encrypt = pdf.context.register(
      pdf.context.obj({ Filter: "Standard", V: 1, R: 2, P: -4 }),
    );
  return Buffer.from(await pdf.save());
}
test("unsupported documents explain their boundary and disable export", async ({
  page,
}) => {
  for (const kind of ["signed", "xfa", "image"] as const) {
    await page.goto("/app");
    await page.getByLabel("Upload a form PDF").setInputFiles({
      name: kind + ".pdf",
      mimeType: "application/pdf",
      buffer: await document(kind),
    });
    await expect(page.locator(".unsupported-state")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review my answers", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Choose another form" }).click();
    await page.getByRole("button", { name: "Clear and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Bring your form." }),
    ).toBeVisible();
  }
});
test("encrypted and malformed PDFs produce recoverable errors", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByLabel("Upload a form PDF").setInputFiles({
    name: "locked.pdf",
    mimeType: "application/pdf",
    buffer: await document("encrypted"),
  });
  await expect(page.getByRole("alert")).toContainText("Password-protected");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.getByLabel("Upload a form PDF").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nnot a real PDF"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(
    page.getByRole("heading", { name: "Bring your form." }),
  ).toBeVisible();
});

test("stopped PDF reply can retry without duplicating the user message",async({page})=>{
 await start(page);const at=new Date();await page.clock.install({time:at});await page.clock.pauseAt(new Date(at.getTime()+1000));
 await answer(page,"Why are there two addresses?");await page.getByRole("button",{name:"Stop response",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Response stopped");await page.getByRole("button",{name:"Retry message",exact:true}).click();await page.clock.runFor(1500);await expect(page.getByRole("log")).toContainText("Both can be true");await expect(page.locator(".interview-message.user")).toHaveCount(1);await expect(page.getByText("0 of 4 questions handled",{exact:false})).toBeVisible();
});
