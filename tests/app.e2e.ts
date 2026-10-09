import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";
async function fixture(fillable = true) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("A fictional application", { x: 50, y: 770, font, size: 20 });
  if (fillable) {
    const form = pdf.getForm();
    for (const [i, name] of ["name", "address"].entries()) {
      page.drawText(name, { x: 50, y: 700 - i * 90, font, size: 12 });
      const f = form.createTextField(name);
      f.addToPage(page, { x: 50, y: 660 - i * 90, width: 480, height: 25 });
    }
    const c = form.createCheckBox("consent");
    c.addToPage(page, { x: 50, y: 440, width: 20, height: 20 });
    const r = form.createRadioGroup("contact");
    r.addOptionToPage("Email", page, { x: 50, y: 390, width: 16, height: 16 });
    r.addOptionToPage("Phone", page, { x: 100, y: 390, width: 16, height: 16 });
    const d = form.createDropdown("region");
    d.addOptions(["Laguna", "Manila"]);
    d.addToPage(page, { x: 50, y: 330, width: 200, height: 25 });
  }
  return Buffer.from(await pdf.save());
}
test("showcase navigation and interactive demonstration", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make sense of forms." }),
  ).toBeVisible();
  await page
    .locator(".interactive-demo")
    .getByRole("button", { name: /Present address/ })
    .click();
  await expect(
    page.locator(".interactive-review").getByText("Residence letter.pdf"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review this answer" }).click();
  await expect(
    page.getByRole("button", { name: "Reviewed by you", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Try the sample", exact: true }).click();
  await expect(page).toHaveURL(/app\/conversation$/);
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeVisible();
  if (await page.getByRole("button", { name: "Original & evidence", exact: true }).isVisible()) await page.getByRole("button", { name: "Original & evidence", exact: true }).click();
  await expect(
    page
      .locator(".review-detail")
      .getByRole("heading", { name: "Full name", exact: true }),
  ).toBeVisible();
});
test("sample evidence, correction, approval and real PDF download", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (["POST", "PUT", "PATCH"].includes(r.method())) requests.push(r.url());
  });
  await page.goto("/app/sample");
  await expect(page).toHaveURL(/app\/conversation$/);
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeVisible();
  if (await page.getByRole("button", { name: "Original & evidence", exact: true }).isVisible()) await page.getByRole("button", { name: "Original & evidence", exact: true }).click();
  await expect(
    page
      .locator(".review-detail")
      .getByRole("heading", { name: "Full name", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-pdf__Page__canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Show in document", exact: true })
    .click();
  await expect(page.getByLabel("Active document")).toHaveValue("sample-record");
  await expect(page.locator(".citation-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".citation-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "Rotate document" }).click();
  await expect(page.locator(".citation-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await expect(page.getByText("1 of 4 reviewed")).toBeVisible();
  await page.getByLabel("Answer Required").fill("Alex Ñ Reyes");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await expect(page.getByText("0 of 4 reviewed")).toBeVisible();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page
    .getByRole("button", { name: "Choose a field", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Present address Choose the right context" })
    .click();
  await page.getByRole("button", { name: "Use this address" }).nth(1).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page
    .getByRole("button", { name: "Choose a field", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Email address Needs your answer" })
    .click();
  await page.getByLabel("Answer Required").fill("alex@example.com");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page
    .getByRole("button", { name: "Choose a field", exact: true })
    .click();
  await page.getByRole("button", { name: "Preferred contact Email" }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page.getByRole("button", { name: "Continue to export" }).click();
  await expect(page).toHaveURL(/app\/export$/);
  await expect(
    page.getByRole("button", { name: "Download draft" }),
  ).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft" }).click();
  const file = await download;
  const bytes = await readFile((await file.path())!);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getForm().getTextField("full_name").getText()).toBe(
    "Alex Ñ Reyes",
  );
  expect(pdf.getForm().getTextField("present_address").getText()).toContain(
    "42 Mabini",
  );
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  expect(requests).toEqual([]);
});
test("manual upload supports widget semantics and restores hash-checked projects", async ({
  page,
}) => {
  await page.goto("/app");
  const buffer = await fixture();
  await page
    .getByLabel("Upload a form PDF")
    .setInputFiles({ name: "manual.pdf", mimeType: "application/pdf", buffer });
  await expect(page).toHaveURL(/app\/conversation$/);
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeVisible();
  if (await page.getByRole("button", { name: "Original & evidence", exact: true }).isVisible()) await page.getByRole("button", { name: "Original & evidence", exact: true }).click();
  await expect(
    page
      .locator(".review-detail")
      .getByRole("heading", { name: "name", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Answer", { exact: true }).fill("María Dela Peña");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page
    .getByRole("button", { name: "Choose a field", exact: true })
    .click();
  await page.getByRole("button", { name: "consent No" }).click();
  await page.getByLabel("Answer", { exact: true }).selectOption("No");
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page
    .getByRole("button", { name: "Choose a field", exact: true })
    .click();
  await page.getByRole("button", { name: "contact Needs your answer" }).click();
  await page.getByLabel("Answer", { exact: true }).selectOption("Phone");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page
    .getByRole("button", { name: "Choose a field", exact: true })
    .click();
  await page.getByRole("button", { name: "region Needs your answer" }).click();
  await page.getByLabel("Answer", { exact: true }).selectOption("Laguna");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  const save = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = await save;
  const project = await readFile((await saved.path())!);
  await page.getByRole("button", { name: "Clear workspace" }).click();
  await page.getByRole("button", { name: "Clear and continue" }).click();
  await page.locator('input[accept="application/json,.json"]').setInputFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: project,
  });
  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles({ name: "manual.pdf", mimeType: "application/pdf", buffer });
  await expect(
    page.getByText("Project restored. Document identities match."),
  ).toBeVisible();
  await expect(page.getByText("4 of 5 reviewed")).toBeVisible();
  await page.getByRole("button", { name: "Continue to export" }).click();
  await page.getByRole("button", { name: "Prepare incomplete draft" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft" }).click();
  const pdf = await PDFDocument.load(
    await readFile((await (await dl).path())!),
  );
  expect(pdf.getForm().getCheckBox("consent").isChecked()).toBe(false);
  expect(pdf.getForm().getRadioGroup("contact").getSelected()).toBe("Phone");
  expect(pdf.getForm().getDropdown("region").getSelected()).toEqual(["Laguna"]);
  expect(pdf.getForm().getTextField("address").getText() ?? "").toBe("");
});
test("plain PDF produces an answer sheet and refresh clears memory", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByLabel("Upload a form PDF").setInputFiles({
    name: "plain.pdf",
    mimeType: "application/pdf",
    buffer: await fixture(false),
  });
  await expect(page).toHaveURL(/app\/conversation$/);
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(
    page.getByText("This PDF has no editable fields.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add an answer" }).click();
  await page.getByLabel("Field name").fill("Applicant name");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add answer" })
    .click();
  await page
    .getByLabel("Answer", { exact: true })
    .fill("Alex Reyes. " + "Reviewed supporting detail. ".repeat(220));
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page.getByRole("button", { name: "Continue to export" }).click();
  await expect(
    page.getByRole("button", { name: "Download draft" }),
  ).toBeEnabled();
  const preview = page.locator(".export-page");
  await preview.getByRole("button", { name: "Next page" }).click();
  await preview.getByRole("button", { name: "Next page" }).click();
  await expect(preview.getByText(/Page 3 of/)).toBeVisible();
  await page.locator("#workspace-main").getByRole("button", { name: "Back to verification" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bring your form." }),
  ).toBeVisible();
});
test("key screens, reduced motion, keyboard focus and accessible structure", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make sense of forms." }),
  ).toBeVisible();
  if (testInfo.project.name === "webkit") {
    // Windows WebKit's default keyboard policy skips links. Verify button navigation
    // separately; native Safari full keyboard access remains a manual check.
    const first = page
      .getByRole("button", { name: /Full name Alex Reyes/ })
      .last();
    await first.focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: /Present address 42 Mabini/ }).last(),
    ).toBeFocused();
  } else {
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
  }
  await page.getByRole("heading", { name: "Make sense of forms." }).click();
  const home = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(home.violations).toEqual([]);
  if (testInfo.project.name === "chromium")
    await page.screenshot({
      path: ".impeccable/review/hero.png",
      fullPage: false,
    });
  await page.goto("/app/sample");
  await expect(page).toHaveURL(/app\/conversation$/);
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeVisible();
  if (await page.getByRole("button", { name: "Original & evidence", exact: true }).isVisible()) await page.getByRole("button", { name: "Original & evidence", exact: true }).click();
  await expect(
    page
      .locator(".review-detail")
      .getByRole("heading", { name: "Full name", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-pdf__Page__canvas")).toBeVisible();
  const workspace = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(workspace.violations).toEqual([]);
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: ".impeccable/review/workspace.png" });
    for (const width of [375, 768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 768 });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          {
            message: `Layout settles without horizontal overflow at ${width}px`,
          },
        )
        .toBe(true);
      await page.screenshot({ path: `.impeccable/review/width-${width}.png` });
    }
    await page.setViewportSize({ width: 683, height: 384 });
    await page.screenshot({
      path: ".impeccable/review/zoom-equivalent-200.png",
    });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator(".react-pdf__Page__canvas")).toBeVisible();
  await page.getByRole("tab", { name: "Answers", exact: true }).click();
  await expect(page.getByLabel("Answer Required")).toBeVisible();
  await page.getByRole("button", { name: "Clear workspace" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear workspace" }),
  ).toBeFocused();
});
