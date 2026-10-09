import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { start, complete, confirm } from "./helpers";
for (const width of [375,1366]) test(`light default, dark choice and preserved journey at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:812});await start(page);
 const findings: unknown[]=[];async function audit(){const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();findings.push(...result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));}
 const workspace=page.locator('.workspace');await expect(workspace).toHaveClass(/workspace-light/);
 await expect(page.locator('.brand img')).toHaveAttribute('src','/brand/wordmark-light.png');
 await page.getByLabel('Message',{exact:true}).fill('Preserved draft');
 for(const theme of ['dark','light','dark']) {
 await page.getByRole('button',{name:`Switch to ${theme} mode`,exact:true}).click();await expect(workspace).toHaveClass(new RegExp(`workspace-${theme}`));await expect(page.getByLabel('Message',{exact:true})).toHaveValue('Preserved draft');await audit();
 if(info.project.name==='chromium')await page.screenshot({path:`.impeccable/review/theme-${theme}-${width}.png`});
 }
 await page.getByRole('button',{name:'Documents',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await audit();await page.keyboard.press('Escape');
 await page.getByLabel('Message',{exact:true}).fill('');await complete(page);await expect(workspace).toHaveClass(/workspace-dark/);
 if(width===375)await page.getByRole("tab",{name:"Preview",exact:true}).click();await expect(page.locator(".working-preview canvas")).toBeVisible();await audit();
 await page.getByRole("button",{name:"Continue",exact:true}).click();await audit();await page.getByRole("button",{name:"Yes, continue to export",exact:true}).click();await expect(workspace).toHaveClass(/workspace-dark/);await page.getByRole('radio',{name:/Word/}).check();await expect(page.getByRole('heading',{name:'Content preview',exact:true})).toBeVisible();await audit();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);page.on('dialog',d=>d.accept());await page.reload();await expect(workspace).toHaveClass(/workspace-light/);await page.getByRole("button",{name:"Switch to dark mode",exact:true}).click();await audit();expect(findings).toEqual([]);
});