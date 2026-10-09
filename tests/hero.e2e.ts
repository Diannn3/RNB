import { test, expect, chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve, dirname, basename } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const before = process.env.PAPELLESS_AUDIT_PASS === "before";
const evidence = resolve("../outputs/PapelLess_Hero_Audit", before ? "before" : "after");

test("hero remains readable across the required viewport matrix", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768], [900, 768], [768, 1024], [390, 844], [320, 720]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Make sense of forms." })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(evidence, `viewport-${width}.png`) });
    await page.screenshot({ path: resolve(evidence, `hero-${width}.png`), fullPage: true });
    await page.locator(".hero").screenshot({ path: resolve(evidence, `hero-only-${width}.png`) });
    if (before) continue;
    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
      };
      return { overflow: document.documentElement.scrollWidth > innerWidth, viewport: innerWidth, hero: bounds(".hero"), paper: bounds(".hero-paper"), record: bounds(".hero-record"), review: bounds(".hero-review"), actions: bounds(".hero-actions"), brand: bounds(".site-header .brand"), navigation: bounds(".site-header nav") };
    });
    expect(geometry.overflow, `page overflow at ${width}`).toBe(false);
    for (const rect of [geometry.paper, geometry.record, geometry.review, geometry.actions, geometry.brand, geometry.navigation]) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(geometry.viewport + 1);
    }
    const overlaps = (a: typeof geometry.paper, b: typeof geometry.paper) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    expect(overlaps(geometry.paper, geometry.record), `paper/source overlap at ${width}`).toBe(false);
    expect(overlaps(geometry.paper, geometry.review), `paper/review overlap at ${width}`).toBe(false);
    if (width >= 1280) expect(geometry.hero.bottom).toBeLessThanOrEqual(height + 1);
  }
});

test("hero keyboard navigation, destinations, grid and accessibility", async ({ page }) => {
  test.skip(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make sense of forms." })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.screenshot({ path: resolve(evidence, "keyboard-skip-focus.png") });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press("Tab");
  const primary = page.locator(".hero-actions").getByRole("link", { name: "Try the sample", exact: true });
  await expect(primary).toBeFocused();
  expect(await primary.evaluate(el => getComputedStyle(el).outlineWidth)).toBe("3px");
  await page.screenshot({ path: resolve(evidence, "keyboard-cta-focus.png") });
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  const grid = page.locator(".hero > .landing-grid");
  await expect(grid).toHaveAttribute("aria-hidden", "true");
  expect(await grid.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
  expect(await grid.evaluate(el => getComputedStyle(el).opacity)).toBe("0.1");
  expect(await page.locator(".hero-actions a").allTextContents()).toEqual([expect.stringContaining("Try the sample"), expect.stringContaining("Start with a form")]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator(".hero-actions").getByRole("link", { name: "Try the sample", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/conversation$/);
  await expect(page.getByRole("button", { name: "Use Alex Reyes", exact: true })).toBeVisible();
  await page.goto("/");
  await page.locator(".hero-actions").getByRole("link", { name: /Start with a form/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Bring your form." })).toBeVisible();
  await page.goto("/");
  await page.locator(".site-header").getByRole("link", { name: /Open workspace/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/");
  await page.locator(".scroll-cue").click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "From a form to a finished draft." })).toBeVisible();
});

test("hero entrance settles and glass has a readable fallback", async ({ page }) => {
  test.skip(before);
  await page.goto("/");
  await expect.poll(() => page.locator(".hero-art").evaluate(el => getComputedStyle(el).transform)).toBe("none");
  await expect(page.getByRole("heading", { name: "Make sense of forms." })).toBeVisible();
  await page.screenshot({ path: resolve(evidence, "normal-motion-desktop.png") });
  await page.addStyleTag({ content: ".hero .hero-record, .hero .hero-review { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: #fff !important; }" });
  await expect(page.locator(".hero-review").getByText("Ready for your review")).toBeVisible();
  await page.screenshot({ path: resolve(evidence, "glass-fallback.png") });
});

test("actual Chromium browser zoom at 200 percent", async () => {
  test.skip(before);
  const profile = await mkdtemp(resolve(tmpdir(), "papelless-zoom-"));
  const extension = resolve(profile, "zoom-extension");
  await mkdir(extension);
  // A temporary local test extension uses the actual browser zoom API.
  await writeFile(resolve(extension, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "PapelLess isolated zoom check", version: "1.0", permissions: ["tabs"], background: { service_worker: "background.js" } }));
  await writeFile(resolve(extension, "background.js"), 'chrome.tabs.onUpdated.addListener((id, change, tab) => { if (change.status === "complete" && tab.url?.startsWith("http://127.0.0.1:4173/")) chrome.tabs.setZoom(id, 2); });');
  const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: { width: 1366, height: 768 }, reducedMotion: "reduce", args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const page = context.pages()[0];
    await page.goto("http://127.0.0.1:4173/");
    await expect(page.getByRole("heading", { name: "Make sense of forms." })).toBeVisible();
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth > innerWidth }));
    expect(metrics.width).toBe(683);
    expect(metrics.dpr).toBe(2);
    expect(metrics.overflow).toBe(false);
    const geometry = await page.evaluate(() => [".site-header .brand", ".nav-launch", ".hero-actions", ".hero-paper", ".hero-record", ".hero-review"].map(selector => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }));
    for (const r of geometry) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(metrics.width + 1);
    }
    await writeFile(resolve(evidence, "browser-zoom-200.json"), JSON.stringify({ ...metrics, geometry }, null, 2));
    // CDP captures physical pixels without Playwright's CSS-coordinate clipping at browser zoom.
    const cdp = await context.newCDPSession(page);
    const capture = async (name: string) => {
      const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(resolve(evidence, name), Buffer.from(result.data, "base64"));
    };
    await capture("browser-zoom-200-top.png");
    await page.locator(".hero-art").evaluate(el => el.scrollIntoView({ block: "start" }));
    await capture("browser-zoom-200-art.png");
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations).toEqual([]);
  } finally {
    await context.close();
    if (dirname(profile) !== resolve(tmpdir()) || !basename(profile).startsWith("papelless-zoom-")) {
      throw new Error("Refusing to remove a profile outside the isolated zoom test directory.");
    }
    await rm(profile, { recursive: true, force: true });
  }
});
