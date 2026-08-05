---
id: T-053
title: Embed the built frontend in the extension binary (stop proxying to a remote host)
status: open
priority: P1
area: build
depends_on: [T-052]
branch:
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

- [ ] With no settings set, `CALL start_gis()` then opening the URL loads the
      full GIS frontend with networking disabled.
- [ ] Assets are served with correct `Content-Type` and gzip `Content-Encoding`;
      deep links / unknown paths fall back to `index.html`.
- [ ] `SET gis_remote_url = 'http://localhost:5173'` still proxies to Vite with
      HMR working.
- [ ] Rebuilding after `pnpm --dir frontend build` picks up the new bundle
      without a manual clean.
- [ ] Resulting `gis.duckdb_extension` size recorded in the progress log.
- [ ] `make` + `./build/release/test/unittest` pass; README documents both modes.

## Progress log

- 2026-08-05: Filed. Decision to embed rather than host taken with the user; see
  Context for the rationale and the measured bundle sizes. Blocked on [T-052]
  for the `gis_remote_url` rename.
