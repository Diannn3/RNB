import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("simple landing is readable, truthful and light across widths", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1480, 1242, 900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Make sense of forms.", exact: true })).toBeVisible();
    await expect(page.locator(".landing-steps li")).toHaveCount(4);
    await expect(page.locator(".signature, .interactive-section, .pin-spacer")).toHaveCount(0);
    await expect(page.locator(".hero-paper .lucide-check")).toHaveCount(0);
    await expect(page.getByText("Ready for your review", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if ([1242, 320].includes(width)) expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  await expect(page.locator("footer .brand img")).toBeVisible();
  expect(await page.locator("footer").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(250, 250, 248)");
  await expect(page.locator(".landing-note")).toContainText("AI agent is not connected yet");
});

test("workflow anchor and closing action lead to the intended destinations", async ({ page }) => {
  await page.goto("/");
  await page.locator(".scroll-cue").click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "From a form to a finished draft." })).toBeVisible();
  await page.locator(".landing-finish").getByRole("link", { name: "Start with a form" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Bring your form." })).toBeVisible();
});
