import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The duckdb-gis extension server (started via `CALL start_gis()`) binds
// "localhost", which resolves to IPv6 [::1] here.
const EXT = "http://[::1]:4214";

// In dev we serve the app from Vite (with HMR) and proxy the extension's
// SQL-over-HTTP API to it, rewriting Origin/Referer so the extension's
// same-origin gate (see src/http_server.cpp) is satisfied.
const withOrigin = (extra: Record<string, string> = {}) => ({
  target: EXT,
  changeOrigin: true,
  headers: { Origin: "http://localhost:4214", ...extra },
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/ddb": withOrigin(),
      "/info": withOrigin(),
      "/localEvents": withOrigin(),
    },
  },
  build: {
    target: "es2022",
    // dist/ is committed and embedded into the extension binary (T-053), not
    // served over a network with browser caching -- so content-hashed
    // filenames buy nothing and only make the build non-reproducible (Vite's
    // hash isn't a pure content hash: identical output has been observed to
    // get a different hash across consecutive builds), which breaks the
    // Frontend.yml staleness check.
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
