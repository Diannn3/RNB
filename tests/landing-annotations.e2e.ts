import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";

const evidence = resolve("../outputs/PapelLess_Annotations");
const geometry = () => {
  const rect = (selector: string) => {
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  return { paper: rect(".signature-paper"), source: rect(".signature-evidence"), overflow: document.documentElement.scrollWidth > innerWidth };
};
function gap(a: ReturnType<typeof geometry>["paper"], b: ReturnType<typeof geometry>["source"]) {
  return Math.max(b.left - a.right, b.top - a.bottom);
}

test("annotated narrative keeps its cards separate at desktop and narrow sizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1480, 1366, 1242, 1024, 900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 668 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Make sense of forms." })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const bounds = await page.evaluate(geometry);
    expect(bounds.overflow, `overflow at ${width}`).toBe(false);
    expect(gap(bounds.paper, bounds.source), `card gap at ${width}`).toBeGreaterThanOrEqual(32);
    const line = page.locator(".signature-line");
    await expect(line).toHaveAttribute("d", /C/);
    expect(await line.evaluate(el => getComputedStyle(el).strokeDashoffset)).toBe("0px");
    if ([1242, 320].includes(width)) {
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(result.violations).toEqual([]);
    }
    if ([1242, 900, 390, 320].includes(width)) {
      await page.screenshot({ path: resolve(evidence, `header-${width}.png`) });
      await page.locator(".signature-inner").screenshot({ path: resolve(evidence, `narrative-${width}.png`) });
      await page.locator(".signature-stage").screenshot({ path: resolve(evidence, `cards-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1480, height: 668 });
  await page.goto("/");
  await expect(page.locator("footer .brand img")).toBeVisible();
  expect(await page.locator("footer .brand img").evaluate(el => getComputedStyle(el).mixBlendMode)).toBe("lighten");
  await page.locator("footer").screenshot({ path: resolve(evidence, "footer-1480.png") });
});

test("curved connector follows the animated paper without card overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1242, height: 668 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every answer has a story." })).toBeVisible();
  const start = await page.locator(".signature").evaluate(el => el.getBoundingClientRect().top + scrollY);
  for (const progress of [0, 0.5, 1]) {
    await page.evaluate(y => scrollTo(0, y), start + progress * 950);
    await expect.poll(async () => { const b = await page.evaluate(geometry); return gap(b.paper, b.source); }).toBeGreaterThanOrEqual(32);
  }
  await expect.poll(() => page.locator(".signature-line").evaluate(el => getComputedStyle(el).strokeDashoffset)).toBe("0px");
  await page.locator(".signature-stage").screenshot({ path: resolve(evidence, "narrative-normal-motion.png") });
});
