import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
test("mobile tabs and source reveal preserve keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/sample");
  const review = page.getByRole("tab", { name: "Review", exact: true });
  await expect(review).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".review-detail h2")).toHaveText("Full name");
  await review.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Questions" })).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "Questions", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "Document", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page
    .getByRole("button", { name: "Show in document", exact: true })
    .click();
  await expect(
    page.getByRole("tabpanel", { name: "Document", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Active document")).toHaveValue("sample-record");
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Choose a field" }).click();
  await page
    .getByRole("button", { name: "Email address Needs your answer" })
    .click();
  await expect(page.locator(".review-detail h2")).toBeFocused();
});
test("keyboard separator resize and citation geometry across zoom and rotation", async ({
  page,
}) => {
  await page.goto("/app/sample");
  await expect(page.locator(".review-detail h2")).toHaveText("Full name");
  const separator = page.getByRole("separator", {
    name: "Resize document and review panes",
  });
  await separator.focus();
  const before = await separator.getAttribute("aria-valuenow");
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => separator.getAttribute("aria-valuenow"))
    .not.toBe(before);
  await page
    .getByRole("button", { name: "Show in document", exact: true })
    .click();
  const aligned = async () => {
    await expect(page.locator(".citation-highlight")).toHaveCount(1);
    await expect
      .poll(
        async () => {
          const a = await page.locator(".citation-highlight").boundingBox();
          const b = await page
            .locator(".react-pdf__Page__textContent span")
            .filter({ hasText: "Full name: Alex Reyes" })
            .boundingBox();
          return (
            !!a &&
            !!b &&
            Math.abs(a.x - b.x) < 8 &&
            Math.abs(a.y - b.y) < 8 &&
            Math.abs(a.width - b.width) < 8 &&
            Math.abs(a.height - b.height) < 8
          );
        },
        { message: "The citation box aligns with actual rendered source text" },
      )
      .toBe(true);
  };
  await aligned();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await aligned();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Rotate document" }).click();
    await aligned();
  }
});
test("unsaved edits invalidate review immediately and block stale export", async ({
  page,
}) => {
  await page.goto("/app/sample");
  await expect(page.locator(".review-detail h2")).toHaveText("Full name");
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await expect(page.getByText("1 of 4 reviewed")).toBeVisible();
  await page.getByLabel("Answer Required").fill("Unsaved correction");
  await expect(page.getByText("0 of 4 reviewed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve this answer" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Prepare draft" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Save your changes before preparing a draft."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve this answer" }),
  ).toBeEnabled();
  await expect(page.locator('.notice[role="status"]')).toContainText(
    "Answer saved",
  );
});
test("manually added answers allow explicit required marking", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const p = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  p.drawText("Plain form", { x: 50, y: 750, font });
  await page.goto("/app");
  await page
    .getByLabel("Upload a form PDF")
    .setInputFiles({
      name: "plain.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByRole("button", { name: "Add an answer" }).click();
  await page.getByLabel("Field name").fill("Applicant");
  await page.getByRole("button", { name: "Add answer", exact: true }).click();
  await page.getByLabel("This answer is required").check();
  await expect(page.getByLabel("Answer Required")).toBeVisible();
});
