import { test, expect } from "@playwright/test";

// The bundle the extension itself serves (frontend/dist embedded at build
// time), driven through the UI only: production builds have no window.gis* seam.
test("the served production bundle runs the core loop", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto("/");
  await expect(page.getByText("regions", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => "gisLayers" in window)).toBe(false);

  const status = page.locator("button:has-text('Run') + span");
  await page.locator("button:has-text('Run')").click();
  await expect(status).toHaveText(/3 features/);
  for (const q of ["SELECT geom FROM demo.regions", "SELECT geom FROM demo.cities"]) {
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText(q);
    await page.locator("button:has-text('Run')").click();
    await expect(status).toHaveText(/\d+ features? ·/);
  }

  await page.getByText("regions", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem").getByRole("button", { name: "Add to map" }).click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Actions for regions" })).toBeVisible();
  await expect(page.getByText("loading…")).toHaveCount(0);
  await expect(page.getByText("failed")).toHaveCount(0);
  expect(errors).toEqual([]);
});
