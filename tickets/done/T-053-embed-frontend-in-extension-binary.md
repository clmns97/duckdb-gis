---
id: T-053
title: Embed the built frontend in the extension binary (stop proxying to a remote host)
status: done
priority: P1
area: build
depends_on: [T-052]
branch: t-053-embed-frontend-in-binary
---

## Goal

`CALL start_gis()` serves the GIS frontend from the extension itself, with no
network access and no hosted origin. A user installs the extension and the UI
works offline. Pointing `gis_remote_url` at a dev server (Vite on :5173) still
proxies as it does today, so the dev loop with HMR is unchanged.

## Context

<context>
**Today the extension serves nothing.** It is a local API server that
blind-proxies every unmatched GET to a remote origin: the catch-all route
`server.Get("/.*", ...)` at `src/http_server.cpp:189` dispatches to
`HttpServer::HandleGet` (`src/http_server.cpp:283`), which opens
`httplib::Client client(remote_url)` (`:287`) and forwards the request. The
default remote is `https://ui.duckdb.org` (`src/include/settings.hpp:9`),
DuckDB Labs' own host. We cannot use it, and we do not want to run an equivalent.

Decision (2026-08-05, with user): **embed rather than host.** Rationale —
- Version lockstep. The frontend talks to endpoints we actively change; shipping
  the app and the server as one artifact removes a whole class of skew bugs.
  (Upstream needs the `X-DuckDB-UI-Extension-Version` header at
  `src/http_server.cpp:317` precisely because their halves ship separately.)
- No infra to own and no domain that can lapse and brick installed copies.
- Works offline, which suits a local-first GIS tool.
Cost accepted: `frontend/dist` must be committed, and a frontend-only change
requires an extension rebuild/release.

Size check (2026-08-05): `frontend/dist` is 3.3 MB raw — `index-*.js` 3.27 MB,
`index-*.css` 190 KB, plus `index.html`. Gzipped JS is ~890 KB. Fine to embed.

Shape:
- Build step: turn `frontend/dist/**` into a compiled-in blob. Simplest robust
  approach is a CMake step that walks the dist tree and generates a
  `.cpp`/`.hpp` with a `const char*`-per-file table keyed by request path
  (byte arrays, not string literals — MSVC has a 64 KB string-literal limit, and
  the JS bundle is 3 MB). Store each file **pre-gzipped** and serve with
  `Content-Encoding: gzip`, which keeps the binary ~1 MB instead of ~3.5 MB and
  is what the browser wants anyway.
- Serving: in `HandleGet`, branch on `remote_url`. Empty (the new default) →
  serve from the embedded table; non-empty → existing proxy path, untouched.
  Needs correct `Content-Type` per extension and an SPA fallback (unknown path
  with no file extension → serve `index.html`).
- Flip `UI_REMOTE_URL_SETTING_DEFAULT` (`src/include/settings.hpp:9`) from
  `https://ui.duckdb.org` to `""`. Note this `#define` is renamed to `gis_*` by
  [T-052] — land that first.
- Dev loop: `SET gis_remote_url = 'http://localhost:5173'` restores today's
  behavior. Document it in README; `frontend/vite.config.ts` already proxies the
  API routes back to :4214 and rewrites Origin for the same-origin gate.

Gotchas:
- The CMake generator must run when `frontend/dist` changes (proper `DEPENDS`),
  or you will ship a stale UI and not notice.
- Do **not** wire `pnpm build` into the CMake build. The community-extensions CI
  runs CMake in a fixed image with no Node; `frontend/dist` has to be committed
  and refreshed deliberately. Add a `make frontend` convenience target and a CI
  check that `dist` is not stale relative to `frontend/src`.
- Committing build output means noisy diffs on a 3 MB minified file. Consider a
  `.gitattributes` entry marking `frontend/dist/**` as binary/`-diff`.
- Wasm builds are excluded in `MainDistributionPipeline.yml` already, so no
  concern there.
- Check whether the community-extensions pipeline enforces an artifact size cap
  before committing to this; ~1 MB embedded should be safe but verify.
</context>

## Acceptance criteria

- [x] With no settings set, `CALL start_gis()` then opening the URL loads the
      full GIS frontend with networking disabled. (Verified via curl:
      byte-identical decoded content vs. `frontend/dist`; no browser
      automation tool was available in this session to visually confirm in a
      real browser — recommend a manual spot-check.)
- [x] Assets are served with correct `Content-Type` and gzip `Content-Encoding`;
      deep links / unknown paths fall back to `index.html`.
- [x] `SET gis_remote_url = 'http://localhost:5173'` still proxies to Vite with
      HMR working. Note: this requires starting the shell with
      `duckdb -unsigned` -- `allow_unsigned_extensions` gates the override
      (inherited from upstream) and can only be set at startup, not via `SET`
      on a running database. Documented in README.
- [x] Rebuilding after `pnpm --dir frontend build` picks up the new bundle
      without a manual clean. Verified: touched `frontend/src/main.tsx`,
      rebuilt, and confirmed the new asset hash was served and the old one
      404'd, with no `rm -rf build`.
- [x] Resulting `gis.duckdb_extension` size recorded in the progress log.
- [x] `make` + `./build/release/test/unittest` pass; README documents both modes.

## Progress log

- 2026-08-05: Filed. Decision to embed rather than host taken with the user; see
  Context for the rationale and the measured bundle sizes. Blocked on [T-052]
  for the `gis_remote_url` rename.
- 2026-08-05: Implemented. `frontend/dist` un-gitignored and committed;
  `scripts/generate_embedded_assets.py` gzip-compresses each file into a
  generated `.cpp` (byte arrays, not string literals) wired via a CMake
  `add_custom_command` with `CONFIGURE_DEPENDS` on `frontend/dist/*`.
  `HttpServer::HandleGet` branches on `remote_url.empty()`: embedded serving
  reuses cpp-httplib's own `find_content_type` for MIME types (no hand-rolled
  map) and falls back to `index.html` for extension-less paths (SPA routes).
  `UI_REMOTE_URL_SETTING_DEFAULT` flipped to `""`. Added `make frontend`
  convenience target and `.github/workflows/Frontend.yml` (rebuilds and
  diffs against the committed `dist/` to catch staleness). `.gitattributes`
  marks `frontend/dist/**` as generated/no-diff.
  Discovered along the way: `SET gis_remote_url=...` is silently ignored
  unless the shell was started with `-unsigned` (the `allow_unsigned_extensions`
  gate can't be changed at runtime) -- not new behavior, but previously
  undocumented; added to README.
  Verified end-to-end: `make` + `./build/release/test/unittest` pass (18
  assertions); curl round-trip confirms byte-identical decoded content for
  `/`, the JS/CSS assets, and the SPA fallback, correct `Content-Type` /
  `Content-Encoding: gzip`, and 404 for unknown extensioned paths; confirmed
  the dev-proxy override works against a live Vite server; confirmed
  incremental rebuild after a `frontend/dist` change with no manual clean.
  Final `gis.duckdb_extension`: 42,781,278 bytes, vs. 41,867,134 bytes for the
  unmodified upstream `ui.duckdb_extension` baseline -- a ~914 KB delta,
  matching the gzip size measured before implementation. Not independently
  visually verified in a real browser (no browser automation tool available
  in this session).
