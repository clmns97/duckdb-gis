import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator(".cm-editor").waitFor({ timeout: 20000 });
await page.waitForTimeout(1500); // catalog + map + spatial LOAD settle

// 1) Build the tile-ready table (EPSG:3857 + R-tree) from the lon/lat source.
const prep = await page.evaluate(async () => {
  try {
    await window.gisTiles.prepareTileLayer({ source: "pts", target: "main.pts_tiles" });
    return "ok";
  } catch (e) {
    return "ERR: " + (e?.message ?? e);
  }
});
console.log("prepareTileLayer:", prep);

// 2) Register the tiled layer, fly to a dense area, assert real MVT features render.
const result = await page.evaluate(async () => {
  window.gisTiles.addTileLayer({
    id: "pts_tiles",
    table: "main.pts_tiles",
    properties: ["id", "name"],
  });
  const map = window.gisTiles.getMap();
  if (!map) return { error: "no map handle" };
  await new Promise((res) => {
    map.jumpTo({ center: [8.5, 47.25], zoom: 10 });
    const done = () => {
      map.off("idle", done);
      res();
    };
    map.on("idle", done);
    setTimeout(res, 10000);
  });
  const feats = map.queryRenderedFeatures({ layers: ["pts_tiles-circle"] });
  return { rendered: feats.length, sample: feats.slice(0, 2).map((f) => f.properties) };
});
console.log("tile render:", JSON.stringify(result));

await page.screenshot({ path: "tiles.png" });
console.log("console/page errors:", errs.length ? errs.slice(0, 8) : "none");
await browser.close();
