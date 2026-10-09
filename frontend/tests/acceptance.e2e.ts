import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { start, complete } from "./helpers";
test("mobile tabs and source reveal preserve keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/sample");
  await expect(page).toHaveURL(/app\/conversation$/);
  await complete(page);
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeVisible();
  if (await page.getByRole("button", { name: "Original & evidence", exact: true }).isVisible()) await page.getByRole("button", { name: "Original & evidence", exact: true }).click();
  const review = page.getByRole("tab", { name: "Answers", exact: true });
  await expect(review).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".review-detail h2")).toHaveText("Full name");
  await review.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Preview", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "Preview", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page
    .getByRole("button", { name: "Show in document", exact: true })
    .click();
  await expect(
    page.getByRole("tabpanel", { name: "Preview", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Active document")).toHaveValue("sample-record");
  await page.getByRole("tab", { name: "Answers", exact: true }).click();
  await page.getByRole("button", { name: "Choose a field" }).click();
  await page
    .getByRole("button", { name: "Email address alex@example.com" })
    .click();
  await expect(page.locator(".review-detail h2")).toBeFocused();
});
test("keyboard separator resize and citation geometry across zoom and rotation", async ({
  page,
}) => {
  await page.goto("/app/sample");
  await expect(page).toHaveURL(/app\/conversation$/);
  await complete(page);
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeVisible();
  if (await page.getByRole("button", { name: "Original & evidence", exact: true }).isVisible()) await page.getByRole("button", { name: "Original & evidence", exact: true }).click();
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

test("clearing a required answer blocks confirmation and optional blanks require explicit disposition", async ({page}) => {
 await start(page); await complete(page);
 await page.getByLabel("Answer Required").fill("");await page.getByRole("button",{name:"Save answer",exact:true}).click();await page.getByRole("button",{name:"Continue",exact:true}).click();await expect(page).toHaveURL(/conversation$/);await expect(page.getByRole("button",{name:"Review my answers",exact:true})).toHaveCount(0);
 await page.getByLabel("Message",{exact:true}).fill("Corrected name");await page.getByRole("button",{name:"Send message",exact:true}).click();await page.getByRole("button",{name:"Review my answers",exact:true}).click();
 await page.getByRole("button",{name:"Choose a field",exact:true}).click();await page.getByRole("button",{name:"Preferred contact Email",exact:true}).click();await page.getByLabel("Answer",{exact:true}).fill("");await page.getByRole("button",{name:"Save answer",exact:true}).click();await expect(page.getByRole("button",{name:"Confirm leaving this blank",exact:true})).toBeVisible();await page.getByRole("button",{name:"Confirm leaving this blank",exact:true}).click();await page.getByRole("button",{name:"Continue",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Is all the information correct?");
});
