import { chromium } from "playwright";

// Drive the app with an arbitrary query passed on argv, to exercise the
// geometry-type dispatch (points / lines / polygons) of the GeoArrow renderer.
const sql = process.argv[2] ?? "";
const out = process.argv[3] ?? "shell.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator(".cm-editor").waitFor({ timeout: 20000 });
await page.waitForTimeout(1500); // catalog + map settle

if (sql) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(sql); // literal insert — no per-char bracket autoclose
}

await page.locator(".run-btn").click();
await page
  .waitForFunction(() => /feature|error|Error/i.test(document.querySelector(".run-status")?.textContent ?? ""), {
    timeout: 20000,
  })
  .catch(() => console.log("(run wait timed out)"));
await page.waitForTimeout(2500); // fitBounds animation + render

// Assert on rendered geometry, not just status text (MapLibre/deck swallow errors).
const featureCount = await page.evaluate(() => {
  const t = document.querySelector(".run-status")?.textContent ?? "";
  const m = t.match(/(\d[\d,]*)\s+feature/);
  return m ? Number(m[1].replace(/,/g, "")) : -1;
});
const deckCanvas = await page.evaluate(() => document.querySelectorAll("canvas").length);

await page.screenshot({ path: out });
console.log("run-status:", await page.evaluate(() => document.querySelector(".run-status")?.textContent));
console.log("featureCount:", featureCount, "| canvases:", deckCanvas);
console.log("console/page errors:", errs.length ? errs.slice(0, 8) : "none");
await browser.close();
process.exit(featureCount > 0 && errs.length === 0 ? 0 : 1);
