import { test, expect } from "@playwright/test";
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
