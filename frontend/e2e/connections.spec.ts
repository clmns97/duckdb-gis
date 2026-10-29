import { test, expect } from "./fixtures";

// The server runs the UI's own table reads on pooled connections, so they don't
// queue behind a slow query on the session connection (src/http_server.cpp).

const SLOW = "SELECT count(*) FROM range(3000000000) t(i) WHERE hash(i) % 7 = 3"; // ~30 s

test("adding a layer doesn't wait for a slow query", async ({ app, page }) => {
  await page.evaluate((sql) => {
    window.gisSlow = window.gisQuery(sql).then(
      () => "finished",
      (e: Error) => e.message,
    );
  }, SLOW);
  await page.waitForTimeout(500); // the slow query holds the session connection

  const t = Date.now();
  await app.addLayer("regions");
  expect((await app.layer("regions"))?.status).toBe("ready");
  expect(Date.now() - t).toBeLessThan(5_000);

  // Cancelling targets the session's query, not the pooled reads.
  await page.evaluate(() => fetch("/ddb/interrupt", { method: "POST" }));
  expect(await page.evaluate(() => window.gisSlow)).toMatch(/interrupt/i);
});

test("pooled queries follow the session's USE", async ({ app }) => {
  const pooledDb = () =>
    app.withModule("/src/lib/duckdb.ts", (m) =>
      m.query("SELECT current_database() AS db", { pooled: true }).then((r: { db: string }[]) => r[0].db),
    );
  expect(await pooledDb()).toBe("memory"); // the working catalog (lib/workspace.ts)
  await app.sql("USE demo");
  expect(await pooledDb()).toBe("demo");
  await app.sql("USE memory");
  expect(await pooledDb()).toBe("memory");
});
