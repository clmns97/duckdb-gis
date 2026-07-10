import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
// Client holds an SSE /localEvents connection open -> don't wait for networkidle.
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator(".cm-editor").waitFor({ timeout: 20000 });
await page.waitForTimeout(1500); // catalog + map settle
// Run the default query
await page.locator(".run-btn").click();
await page
  .waitForFunction(() => /feature|error|Error/i.test(document.querySelector(".run-status")?.textContent ?? ""), {
    timeout: 20000,
  })
  .catch(() => console.log("(run wait timed out)"));
await page.waitForTimeout(2500); // fitBounds animation + tiles
await page.screenshot({ path: "shell.png" });
console.log("run-status:", await page.evaluate(() => document.querySelector(".run-status")?.textContent));
console.log("sidebar:", await page.evaluate(() => document.querySelector(".sidebar")?.textContent?.replace(/\s+/g, " ").trim()));
console.log("console/page errors:", errs.length ? errs.slice(0, 8) : "none");
await browser.close();
