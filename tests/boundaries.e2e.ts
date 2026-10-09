import { test, expect } from "@playwright/test";
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
    await expect(
      page.getByRole("button", { name: "Prepare draft" }),
    ).toBeDisabled();
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
test("prefilled values remain visible and manual evidence can be linked", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByLabel("Upload a form PDF").setInputFiles({
    name: "prefilled.pdf",
    mimeType: "application/pdf",
    buffer: await document(),
  });
  await expect(page.getByLabel("Answer", { exact: true })).toHaveValue(
    "Existing answer",
  );
  await page.getByRole("button", { name: "Manage documents" }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "support.pdf",
    mimeType: "application/pdf",
    buffer: await document("support"),
  });
  await expect(
    page.getByRole("button", { name: "Link a supporting passage" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Link a supporting passage" }).click();
  await page.getByLabel("Exact quotation").fill("An invented quotation");
  await page.getByRole("button", { name: "Link passage" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "could not be found",
  );
  await page.getByLabel("Exact quotation").fill("Full name: Alex Reyes");
  await page.getByRole("button", { name: "Link passage" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Show in document" }).click();
  await expect(page.locator(".citation-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await expect(page.getByText("1 of 1 reviewed")).toBeVisible();
  await page.getByRole("button", { name: "Remove support.pdf" }).click();
  await page.getByRole("button", { name: "Clear and continue" }).click();
  await expect(page.getByText("0 of 1 reviewed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show in document" }),
  ).not.toBeVisible();
});
test("cancellation and later edits protect against stale sample results", async ({
  page,
}) => {
  await page.goto("/app/sample");
  await expect(
    page
      .locator(".review-detail")
      .getByRole("heading", { name: "Full name", exact: true }),
  ).toBeVisible();
  const clockStart = new Date();
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
  await page.getByRole("button", { name: "Run sample again" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("Operation cancelled.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run sample again" }).click();
  await page.getByLabel("Answer Required").fill("A correction during analysis");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator(".busy-banner")).not.toBeVisible();
  await expect(page.getByLabel("Answer Required")).toHaveValue(
    "A correction during analysis",
  );
  await page.getByRole("button", { name: "Choose a field" }).click();
  await page
    .getByRole("button", { name: "Email address Needs your answer" })
    .click();
  await page.getByLabel("Answer Required").fill("unsaved@example.com");
  await page.getByRole("button", { name: "Choose a field" }).click();
  await page
    .getByRole("button", { name: "Present address Choose the right context" })
    .click();
  await expect(page.getByLabel("Answer Required")).toHaveValue("");
});
test("questions occur once and manual/sample transitions clear scenario answers", async ({
  page,
}) => {
  await page.goto("/app/sample");
  await expect(
    page
      .locator(".review-detail")
      .getByRole("heading", { name: "Full name", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Questions 2", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Email address Needs your answer" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Use your own form" }).click();
  await page.getByRole("button", { name: "Clear and continue" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Bring your form." }),
  ).toBeVisible();
  await expect(page.locator(".review-detail")).toHaveCount(0);
});
