import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function sample(page: import("@playwright/test").Page) {
  await page.goto("/app/sample");
  await expect(page).toHaveURL(/\/app\/conversation$/);
  await expect(page.getByRole("heading", { name: "Which address describes where you live now?" })).toBeVisible();
}
test("guided interview, cited PDF question, editable preview and dedicated export", async ({ page }, info) => {
  const outgoing: string[] = []; page.on("request", (r) => { if (["POST", "PUT", "PATCH"].includes(r.method())) outgoing.push(r.url()); });
  await sample(page);
  await page.getByLabel("Ask about your PDF", { exact: true }).fill("Why are there two addresses?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log")).toContainText("Both can be true");
  await expect(page.getByRole("heading", { name: "Which address describes where you live now?" })).toBeVisible();
  if (info.project.name === "chromium") await page.screenshot({ path: ".impeccable/review/conversation-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "42 Mabini Street, Los Banos", exact: true }).click();
  await page.getByLabel("Your answer (required)").fill("alex@example.com");
  await page.getByRole("button", { name: "Add answer", exact: true }).click();
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(page.getByText("0 of 4 reviewed")).toBeVisible();
  await expect(page.locator(".working-preview .react-pdf__Page__canvas")).toBeVisible();
  const canvas = page.locator(".working-preview .react-pdf__Page__canvas");
  const previewHash = async () => createHash("sha256").update(await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL())).digest("hex");
  const beforePreview = await previewHash();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await page.getByLabel("Answer Required").fill("Alex Ñ Reyes");
  await expect(page.getByText("0 of 4 reviewed")).toBeVisible();
  await expect.poll(previewHash, { message: "The rendered PDF changes when an unsaved answer is edited" }).not.toBe(beforePreview);
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.getByRole("button", { name: "Approve this answer" }).click();
  await expect(page.locator(".working-preview .react-pdf__Page__canvas")).toBeVisible();
  if (info.project.name === "chromium") await page.screenshot({ path: ".impeccable/review/verification-desktop.png" });
  await page.getByRole("button", { name: "Continue to export" }).click();
  await page.getByRole("button", { name: "Prepare incomplete draft" }).click();
  await expect(page).toHaveURL(/\/app\/export$/);
  await expect(page.getByRole("heading", { name: "Incomplete draft", exact: true })).toBeVisible();
  await expect(page.locator(".export-document .react-pdf__Page__canvas")).toBeVisible();
  const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download draft", exact: true }).click();
  const pdf = await PDFDocument.load(await readFile((await (await dl).path())!));
  expect(pdf.getForm().getTextField("full_name").getText()).toBe("Alex Ñ Reyes");
  expect(pdf.getForm().getTextField("email").getText() ?? "").toBe("");
  if (info.project.name === "chromium") await page.screenshot({ path: ".impeccable/review/export-desktop.png" });
  await page.locator("#workspace-main").getByRole("button", { name: "Back to verification" }).click();
  await page.getByLabel("Answer Required").fill("Different answer");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Download draft" })).toBeDisabled();
  expect(outgoing).toEqual([]);
});
test("mobile sources preserve composer and keyboard navigation; stage screens are accessible", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await sample(page);
  await page.getByLabel("Ask about your PDF", { exact: true }).fill("A draft question");
  await page.getByRole("button", { name: "Show in document" }).nth(1).click();
  await expect(page.getByRole("dialog").locator(".react-pdf__Page__canvas")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Show in document" }).nth(1)).toBeFocused();
  await expect(page.getByLabel("Ask about your PDF", { exact: true })).toHaveValue("A draft question");
  const conversation = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(conversation.violations).toEqual([]);
  if (info.project.name === "chromium") await page.screenshot({ path: ".impeccable/review/conversation-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your answers." })).toBeFocused();
  const answers = page.getByRole("tab", { name: "Answers", exact: true }); await answers.focus(); await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Preview", exact: true })).toBeFocused();
  await expect(page.locator(".working-preview .react-pdf__Page__canvas")).toBeVisible();
  const verification = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(verification.violations).toEqual([]);
  for (const width of [375, 768, 1024, 1366, 1920]) { await page.setViewportSize({ width, height: 768 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
});
test("real PDF upload opens truthful manual conversation and retains transcript across stages", async ({ page }) => {
  const pdf = await PDFDocument.create(); const p = pdf.addPage(); const font = await pdf.embedFont(StandardFonts.Helvetica); p.drawText("Test form", { x: 50, y: 750, font }); const f = pdf.getForm().createTextField("name"); f.addToPage(p, { x: 50, y: 700, width: 300, height: 25 });
  await page.goto("/app"); await page.getByLabel("Upload a form PDF").setInputFiles({ name: "manual.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  await expect(page).toHaveURL(/\/app\/conversation$/);
  await expect(page.getByRole("log")).toContainText("AI agent is not connected");
  await page.getByLabel("Your answer (optional)").fill("María Reyes"); await page.getByRole("button", { name: "Add answer", exact: true }).click();
  await page.getByLabel("Ask about your PDF", { exact: true }).fill("What does the form mean?"); await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log")).toContainText("PDF interpretation is unavailable");
  await page.getByRole("link", { name: "Verification" }).click(); await expect(page.getByLabel("Answer", { exact: true })).toHaveValue("María Reyes");
  await page.getByRole("link", { name: "Conversation", exact: true }).click(); await expect(page.getByRole("log")).toContainText("María Reyes");
  await page.getByRole("button", { name: "Clear workspace" }).click(); await page.getByRole("button", { name: "Clear and continue" }).click();
  await expect(page).toHaveURL(/\/app$/); await expect(page.getByRole("log")).toHaveCount(0);
});

test("project restoration retains conversation and safely resumes legacy and export stages", async ({ page }) => {
  const pdf = await PDFDocument.create(); const p = pdf.addPage();
  p.drawText("Restore form", { x: 50, y: 750 });
  pdf.getForm().createTextField("name").addToPage(p, { x: 50, y: 700, width: 300, height: 25 });
  const buffer = Buffer.from(await pdf.save());
  await page.goto("/app");
  await page.getByLabel("Upload a form PDF").setInputFiles({ name: "restore.pdf", mimeType: "application/pdf", buffer });
  await expect(page).toHaveURL(/\/app\/conversation$/);
  await page.getByLabel("Your answer (optional)").fill("Saved answer");
  await page.getByRole("button", { name: "Add answer", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const project = JSON.parse(await readFile((await (await download).path())!, "utf8"));
  expect(project.schemaVersion).toBe(2); expect(project.stage).toBe("conversation");
  expect(project.messages.some((m: { text: string }) => m.text.includes("Saved answer"))).toBe(true);
  for (const variant of [project, { ...project, stage: "export" }, { ...project, schemaVersion: 1, stage: undefined, messages: undefined, skipped: undefined, question: undefined }]) {
    await page.getByRole("button", { name: "Clear workspace" }).click();
    await page.getByRole("button", { name: "Clear and continue" }).click();
    await page.locator('input[accept="application/json,.json"]').setInputFiles({ name: "project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(variant)) });
    await page.getByRole("dialog").locator('input[type="file"][multiple]').setInputFiles({ name: "restore.pdf", mimeType: "application/pdf", buffer });
    await expect(page).toHaveURL(variant.stage === "conversation" ? /\/app\/conversation$/ : /\/app\/verification$/);
    if (variant.stage === "conversation") await expect(page.getByRole("log")).toContainText("Saved answer");
    else { await expect(page.getByLabel("Answer", { exact: true })).toHaveValue("Saved answer"); await expect(page.getByRole("button", { name: "Download draft" })).toHaveCount(0); }
  }
});
