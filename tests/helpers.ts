import { expect, type Page } from "@playwright/test";
export async function start(page: Page) {
 await page.goto("/app/sample"); await expect(page).toHaveURL(/\/app\/conversation$/);
 await expect(page.getByRole("button", {name:"Use Alex Reyes",exact:true})).toBeVisible();
}
export async function answer(page: Page, text: string) { await page.getByLabel("Message",{exact:true}).fill(text); await page.getByRole("button",{name:"Send message",exact:true}).click(); }
export async function complete(page: Page, blank = false) {
 await page.getByRole("button",{name:"Use Alex Reyes",exact:true}).click();
 await page.getByRole("button",{name:"42 Mabini Street, Los Banos",exact:true}).click();
 await answer(page,"alex@example.com");
 if(blank) await page.getByRole("button",{name:"Leave blank",exact:true}).click();
 else await page.getByRole("button",{name:"Use Email",exact:true}).click();
 await page.getByRole("button",{name:"Review my answers",exact:true}).click();
 await expect(page).toHaveURL(/\/app\/verification$/);
}
export async function confirm(page:Page) { await page.getByRole("button",{name:"Continue",exact:true}).click(); await page.getByRole("button",{name:"Yes, continue to export",exact:true}).click(); await expect(page).toHaveURL(/\/app\/export$/); }
