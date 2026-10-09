import { test, expect } from "@playwright/test";

import AxeBuilder from "@axe-core/playwright";

import { PDFDocument } from "pdf-lib";

import JSZip from "jszip";

import { readFile } from "node:fs/promises";

import { start, answer, complete, confirm } from "./helpers";

test("one question, PDF questions, correction, final confirmation and both downloads", async ({page},info)=> {

 const outgoing:string[]=[];page.on("request",r=>{if(["POST","PUT","PATCH"].includes(r.method()))outgoing.push(r.url());});

 await start(page);

 await expect(page.locator(".inline-question-controls")).toHaveCount(1);

 await expect(page.getByRole("log").getByText("What should we use for full name?",{exact:true})).toHaveCount(1);

 await page.getByRole("link",{name:"Verification",exact:true}).click();await expect(page).toHaveURL(/conversation$/);

 await answer(page,"Why are there two addresses?");await expect(page.getByRole("log")).toContainText("Both can be true");

 await expect(page.getByRole("button",{name:"Use Alex Reyes",exact:true})).toBeVisible();

 if(info.project.name==="chromium")await page.screenshot({path:".impeccable/review/chat-desktop.png"});

 await complete(page);

 await page.getByLabel("Answer Required").fill("Alex \u00d1 Reyes");

 await page.getByRole("button",{name:"Continue",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);

 await page.getByRole("button",{name:"Save answer",exact:true}).click();

 await page.getByRole("button",{name:"Continue",exact:true}).click();

 await expect(page.getByRole("dialog")).toContainText("Is all the information correct?");

 await page.getByRole("button",{name:"No, keep editing",exact:true}).click();await expect(page).toHaveURL(/verification$/);

 if(info.project.name==="chromium")await page.screenshot({path:".impeccable/review/verification-desktop.png"});

 await confirm(page);await expect(page.getByRole("button",{name:"Download PDF",exact:true})).toBeDisabled();

 await page.getByRole("radio",{name:/PDF/}).check();await expect(page.locator(".export-document canvas")).toBeVisible();

 const pdfDownload=page.waitForEvent("download");await page.getByRole("button",{name:"Download PDF",exact:true}).click();

 const pdf=await PDFDocument.load(await readFile((await(await pdfDownload).path())!));expect(pdf.getForm().getTextField("full_name").getText()).toBe("Alex \u00d1 Reyes");expect(pdf.getForm().getTextField("email").getText()).toBe("alex@example.com");

 await page.getByRole("radio",{name:/Word/}).check();await expect(page.getByRole("heading",{name:"Content preview",exact:true})).toBeVisible();

 const wordDownload=page.waitForEvent("download");await page.getByRole("button",{name:"Download Word",exact:true}).click();const zip=await JSZip.loadAsync(await readFile((await(await wordDownload).path())!));const xml=await zip.file("word/document.xml")!.async("string");expect(xml).toContain("Alex \u00d1 Reyes");expect(xml).toContain("alex@example.com");

 if(info.project.name==="chromium")await page.screenshot({path:".impeccable/review/export-desktop.png"});

 await page.locator("#workspace-main").getByRole("button",{name:"Back to verification",exact:true}).click();await page.getByLabel("Answer Required").fill("Changed");await page.getByRole("button",{name:"Save answer",exact:true}).click();await page.goBack();await expect(page).toHaveURL(/verification$/);expect(outgoing).toEqual([]);

});

test("mobile chat, draft retention, accessibility and responsive verification",async({page},info)=>{

 await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:"reduce"});await start(page);

 await page.getByLabel("Message",{exact:true}).fill("Draft preserved");await page.getByRole("button",{name:"Documents",exact:true}).click();await expect(page.getByRole("dialog").locator("canvas")).toBeVisible();await page.keyboard.press("Escape");await expect(page.getByRole("button",{name:"Documents",exact:true})).toBeFocused();await expect(page.getByLabel("Message",{exact:true})).toHaveValue("Draft preserved");

 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);

 if(info.project.name==="chromium")await page.screenshot({path:".impeccable/review/chat-mobile.png"});await page.getByLabel("Message",{exact:true}).fill("");await complete(page);

 await page.getByRole("tab",{name:"Preview",exact:true}).click();await expect(page.locator(".working-preview canvas")).toBeVisible();

 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);

 for(const width of [375,768,1024,1366,1920]){await page.setViewportSize({width,height:768});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(info.project.name==="chromium")await page.screenshot({path:`.impeccable/review/interview-width-${width}.png`});}

});

test("earlier corrections return as a new question and renew subsequent confirmations",async({page})=>{

 await start(page);await complete(page);await page.getByRole("link",{name:"Conversation",exact:true}).click();await page.getByRole("button",{name:"Edit answer",exact:true}).first().click();await expect(page.locator(".inline-question-controls")).toHaveCount(1);await answer(page,"New Name");await expect(page.getByRole("button",{name:"42 Mabini Street, Los Banos",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Review my answers",exact:true})).toHaveCount(0);
 await expect(page.locator(".interview-message").last()).toContainText("Which address describes where you live now?");
 await page.getByRole("button",{name:"42 Mabini Street, Los Banos",exact:true}).click();
 await expect(page.locator(".interview-message").last()).toContainText("What email address");

});

test("single composer supports Enter, Shift+Enter and IME composition",async({page})=>{
 await start(page);const input=page.getByLabel("Message",{exact:true});await input.fill("A new name");await input.dispatchEvent("keydown",{key:"Enter",code:"Enter",isComposing:true});await expect(page.locator(".interview-message.user")).toHaveCount(0);await expect(input).toHaveValue("A new name");await input.press("Shift+Enter");await expect(input).toHaveValue("A new name\n");await input.press("Enter");await expect(page.locator(".interview-message.user")).toHaveCount(1);await expect(page.getByRole("button",{name:"42 Mabini Street, Los Banos",exact:true})).toBeVisible();await expect(input).toHaveValue("");await page.setViewportSize({width:683,height:384});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
