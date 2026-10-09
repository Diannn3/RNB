import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("audited branding and preserved five-step narrative remain readable",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 for(const width of [1480,1242,900,768,390,320]){
 await page.setViewportSize({width,height:768});await page.goto("/");await expect(page.getByRole("heading",{name:"Make sense of forms.",exact:true})).toBeVisible();await expect(page.locator(".signature-phase")).toHaveCount(5);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if([1242,320].includes(width))expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 }
 await expect(page.locator("footer .brand img")).toBeVisible();expect(await page.locator("footer .brand img").evaluate(e=>getComputedStyle(e).mixBlendMode)).toBe("lighten");
});

test("stacked narrative remains unpinned and fully readable at 1100px",async({page})=>{
 await page.setViewportSize({width:1100,height:768});await page.goto("/");await expect(page.locator(".signature-cinematic")).toHaveCount(0);for(const title of ["Start with a blank field.","Read the original.","A suggestion, with its source.","Your judgment comes next.","A draft. Ready to read."])await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
});
