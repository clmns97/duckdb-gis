import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The duckdb-gis extension server (started via `CALL start_gis()`) binds
// "localhost", which resolves to IPv6 [::1] here.
const EXT = "http://[::1]:4213";

// In dev we serve the app from Vite (with HMR) and proxy the extension's
// SQL-over-HTTP API to it, rewriting Origin/Referer so the extension's
// same-origin gate (see src/http_server.cpp) is satisfied.
const withOrigin = (extra: Record<string, string> = {}) => ({
  target: EXT,
  changeOrigin: true,
  headers: { Origin: "http://localhost:4213", ...extra },
});

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/ddb": withOrigin(),
      "/info": withOrigin(),
      "/localEvents": withOrigin(),
      "/localToken": withOrigin({ Referer: "http://localhost:4213/" }),
    },
  },
  build: { target: "es2022" },
});
