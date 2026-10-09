import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { answer, confirm } from "./helpers";
async function fixture(fillable = true) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("A fictional application", { x: 50, y: 770, font, size: 20 });
  if (fillable) {
    const form = pdf.getForm();
    for (const [i, name] of ["name", "address"].entries()) {
      page.drawText(name, { x: 50, y: 700 - i * 90, font, size: 12 });
      const f = form.createTextField(name);
      f.addToPage(page, { x: 50, y: 660 - i * 90, width: 480, height: 25 });
    }
    const c = form.createCheckBox("consent");
    c.addToPage(page, { x: 50, y: 440, width: 20, height: 20 });
    const r = form.createRadioGroup("contact");
    r.addOptionToPage("Email", page, { x: 50, y: 390, width: 16, height: 16 });
    r.addOptionToPage("Phone", page, { x: 100, y: 390, width: 16, height: 16 });
    const d = form.createDropdown("region");
    d.addOptions(["Laguna", "Manila"]);
    d.addToPage(page, { x: 50, y: 330, width: 200, height: 25 });
  }
  return Buffer.from(await pdf.save());
}

test("real PDF sequential widgets, optional blank and hash-checked project restoration",async({page})=>{
 const buffer=await fixture();await page.goto("/app");await page.getByLabel("Upload a form PDF").setInputFiles({name:"manual.pdf",mimeType:"application/pdf",buffer});await expect(page).toHaveURL(/conversation$/);
 await expect(page.getByRole("log")).toContainText("manual interview");
 await answer(page,"Summarize the document");await expect(page.getByRole("button",{name:"Use as answer",exact:true})).toBeVisible();await page.getByRole("button",{name:"Ask about PDF",exact:true}).click();await expect(page.getByRole("log")).toContainText("PDF interpretation is unavailable");await expect(page.getByText("0 of 5 questions handled",{exact:false})).toBeVisible();
 await answer(page,"Mar\u00eda Dela Pe\u00f1a");await page.getByRole("button",{name:"Leave blank",exact:true}).click();await page.getByRole("button",{name:"No",exact:true}).click();await page.getByRole("button",{name:"Phone",exact:true}).click();await page.getByRole("button",{name:"Laguna",exact:true}).click();await page.getByRole("button",{name:"Review my answers",exact:true}).click();
 const save=page.waitForEvent("download");await page.getByRole("button",{name:"Save project",exact:true}).click();const project=JSON.parse(await readFile((await(await save).path())!,"utf8"));expect(project.schemaVersion).toBe(3);expect(Object.keys(project.progress)).toHaveLength(5);
 for(const version of [3,2,1]){
 await page.getByRole("button",{name:"Clear workspace",exact:true}).click();await page.getByRole("button",{name:"Clear and continue",exact:true}).click();await page.locator('input[accept="application/json,.json"]').setInputFiles({name:"project.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({...project,schemaVersion:version,stage:"export"}))});await page.getByRole("dialog").locator('input[type="file"][multiple]').setInputFiles({name:"manual.pdf",mimeType:"application/pdf",buffer});await expect(page).toHaveURL(version===3?/verification$/:/conversation$/);await expect(page.getByRole("button",{name:"Download PDF",exact:true})).toHaveCount(0);
 if(version!==3){await page.getByRole("button",{name:"Use Mar\u00eda Dela Pe\u00f1a",exact:true}).click();await page.getByRole("button",{name:"Leave blank",exact:true}).click();await page.getByRole("button",{name:"No",exact:true}).click();await page.getByRole("button",{name:"Phone",exact:true}).click();await page.getByRole("button",{name:"Laguna",exact:true}).click();await page.getByRole("button",{name:"Review my answers",exact:true}).click();}
 }
 await confirm(page);await page.getByRole("radio",{name:/PDF/}).check();const dl=page.waitForEvent("download");await page.getByRole("button",{name:"Download PDF",exact:true}).click();const pdf=await PDFDocument.load(await readFile((await(await dl).path())!));expect(pdf.getForm().getTextField("name").getText()).toBe("Mar\u00eda Dela Pe\u00f1a");expect(pdf.getForm().getTextField("address").getText()??"").toBe("");expect(pdf.getForm().getCheckBox("consent").isChecked()).toBe(false);expect(pdf.getForm().getRadioGroup("contact").getSelected()).toBe("Phone");expect(pdf.getForm().getDropdown("region").getSelected()).toEqual(["Laguna"]);
});
test("nonfillable PDFs require a manual question; answer sheet and refresh are truthful",async({page})=>{
 await page.goto("/app");await page.getByLabel("Upload a form PDF").setInputFiles({name:"plain.pdf",mimeType:"application/pdf",buffer:await fixture(false)});await expect(page.getByText("This PDF has no editable fields.",{exact:false})).toBeVisible();await expect(page.getByRole("button",{name:"Review my answers",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Add a question",exact:true}).click();await page.getByLabel("Field name").fill("Applicant");await page.getByRole("dialog").getByRole("button",{name:"Add answer",exact:true}).click();await answer(page,"Alex Reyes. "+"Reviewed detail. ".repeat(600));await page.getByRole("button",{name:"Review my answers",exact:true}).click();await confirm(page);await page.getByRole("radio",{name:/PDF/}).check();const dl=page.waitForEvent("download");await page.getByRole("button",{name:"Download PDF",exact:true}).click();const pdf=await PDFDocument.load(await readFile((await(await dl).path())!));expect(pdf.getPageCount()).toBeGreaterThan(2);page.on("dialog",d=>d.accept());await page.reload();await expect(page.getByRole("heading",{name:"Bring your form.",exact:true})).toBeVisible();
});
