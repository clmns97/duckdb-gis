import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// The suite starts its own extension server (over a throwaway copy of
// testdata/demo.duckdb, see testdata/serve.py) and Vite dev server, on ports
// that don't collide with a dev setup already running on 4214 / 5173.
export const GIS_PORT = 4215;
const VITE_PORT = 5174;
const CI = Boolean(process.env.CI);
const repo = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const python = process.env.GIS_PYTHON ?? repo("configure/venv/bin/python");

export default defineConfig({
  testDir: "e2e",
  // One shared extension server (one DuckDB connection), so tests run one at a
  // time; the `app` fixture resets its working catalog between tests.
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${VITE_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // The full suite drives the dev build: it reads state through the
    // DEV-only `window.gis*` seam (App.tsx).
    { name: "app", testIgnore: /prod\.spec\.ts/ },
    // UI-only checks against the bundle the extension itself serves.
    { name: "prod", testMatch: /prod\.spec\.ts/, use: { baseURL: `http://localhost:${GIS_PORT}` } },
  ],
  webServer: [
    {
      command: `${python} ${repo("testdata/serve.py")} ${GIS_PORT}`,
      url: `http://localhost:${GIS_PORT}/`,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: `pnpm exec vite --port ${VITE_PORT} --strictPort`,
      url: `http://127.0.0.1:${VITE_PORT}/`,
      env: { GIS_PORT: String(GIS_PORT) },
    },
  ],
});
