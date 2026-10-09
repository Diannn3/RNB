import { test, expect } from "@playwright/test";
test("static fictional narrative includes every stage without sample downloads", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const heading of [
    "Start with a blank field.",
    "Read the original.",
    "A suggestion, with its source.",
    "Your judgment comes next.",
    "A draft. Ready to read.",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".signature-phase .story-field.empty")).toHaveText(
    "Your answer goes here",
  );
  await expect(page.getByRole("button", { name: /sample draft/i })).toHaveCount(0);
  const liveDraft = page.getByRole("link", { name: "Prepare a live draft" });
  await expect(liveDraft).toHaveAttribute("href", "/app");
  await liveDraft.click();
  await expect(page).toHaveURL(/\/app$/);
});
test("desktop scroll progression and dynamic reduced motion clean up pinning", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".signature-cinematic")).toHaveCount(1);
  const start = await page
    .locator(".signature-story")
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const steps = ["Blank field", "Source", "Suggestion", "Your review", "Draft"];
  for (const [i, progress] of [0.04, 0.23, 0.45, 0.67, 0.98].entries()) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "instant" }),
      start + 1600 * progress,
    );
    await expect(
      page.locator('.signature-steps [aria-current="step"]'),
    ).toHaveText(steps[i]);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".signature-cinematic")).toHaveCount(0);
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(
    page.locator('.signature-phase[aria-hidden="false"]'),
  ).toHaveCount(5);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await page.locator(".site-header").getByRole("link", { name: "Open workspace" }).click();
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
});
test("the heading and explanation are readable before JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4173/");
    await expect(
      page.getByRole("heading", { name: "Make sense of forms." }),
    ).toBeVisible();
    await expect(
      page.getByText("Enable JavaScript to open the local PDF workspace.", {
        exact: false,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
