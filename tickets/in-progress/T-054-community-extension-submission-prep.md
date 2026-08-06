---
id: T-054
title: Prepare duckdb-gis for listing as a DuckDB community extension
status: in-progress
priority: P2
area: build
depends_on: [T-052, T-053]
branch: t-054-community-extension-submission
---

## Goal

`INSTALL gis FROM community; LOAD gis; CALL start_gis();` works on a stock DuckDB
for a user who has never seen this repo. "Done" means the submission PR to
`duckdb/community-extensions` is open with a green build.

## Context

<context>
The community-extensions flow: you open a PR against `duckdb/community-extensions`
adding a `description.yml` that points at **our** repo + a pinned ref (tag or
commit). Their CI builds it for all target platforms using `extension-ci-tools`,
signs it, and publishes to `community-extensions.duckdb.org`. Nothing about our
repo being a **fork** of `duckdb/duckdb-ui` blocks this. **Verify the current
submission requirements against the community-extensions repo docs before
writing `description.yml`** — the format and required fields change.

Prerequisites, both blocking:
- [T-052] — the extension is still named `ui`, which collides with DuckDB's core
  `ui` extension.
- [T-053] — until the frontend is embedded, the extension proxies to
  `https://ui.duckdb.org` (`src/include/settings.hpp:9`), which is DuckDB Labs'
  host and would serve *their* UI to our users.

Remaining work in this ticket:
- Release tagging. Community builds pin a ref per DuckDB version; we currently
  have no tags. Establish a versioning scheme and cut a first tag.
- **Strip the MotherDuck integration.** `src/utils/md_helpers.cpp` (`GetMDToken`,
  `IsMDConnected`) and the `/localToken` route (`src/http_server.cpp:185-187`,
  handler at `:231`) exist so DuckDB's hosted UI can hand off to MotherDuck. It
  is dead weight for us and a confusing thing to ship. Removing it also shrinks
  the upstream-merge surface in the places we least want conflicts — weigh that
  against the fact that it is currently a zero-maintenance no-op when the
  `motherduck` extension is absent (`md_helpers.cpp:23`).
- **Risk to de-risk early: `Makefile:15`.** We added
  `yum install -y perl-core` as a build prereq (OpenSSL 3.6+ needs Perl core
  modules and the linux_amd64 LTS image lacks them). Community CI runs fixed
  images and may not run our Makefile targets the same way, or may not allow the
  install. Test this before anything else in this ticket — if it breaks, the
  fallback is pinning an OpenSSL version in `vcpkg.json`.
- Metadata: license (we inherit upstream's MIT — confirm attribution to
  `duckdb/duckdb-ui` is preserved and correct), description, maintainer handle.
- README aimed at a stranger: install line, what it does, screenshot, and the
  launch story (`CALL start_gis()`, plus the `.ui_command start_gis()` route to
  reclaim `duckdb -ui`).
- Check whether the fork needs a distinct default branch / whether GitHub Actions
  behave differently on forks for the release workflow.

Open question to settle before submitting: does an extension that bundles a
~1 MB web app fit within whatever artifact size limits the pipeline enforces?
Measure the built artifact from [T-053] first.
</context>

## Acceptance criteria

- [ ] The extension builds green in `MainDistributionPipeline.yml` under the name
      `gis` for all non-excluded platforms. **Needs a push — nothing since
      2026-07-22 has been through CI.**
- [x] `Makefile` perl-core hack investigated: it cannot be replaced in place, and
      the version-pin theory is disproved. Retiring it needs [T-056]. Whether it
      *works* on the community image is still only confirmable by a CI run.
- [x] MotherDuck code path removed.
- [x] The versioning scheme is written down (README "Versioning"). A release tag
      is deliberately deferred until CI is green.
- [x] README rewritten for an outside user; license/attribution correct, plus a
      trademark + non-affiliation notice.
- [ ] `description.yml` PR open against `duckdb/community-extensions`.
      Descriptor drafted at `description.yml`; needs a real `repo.ref`.
- [ ] Verified from a clean machine/container:
      `INSTALL gis FROM community; LOAD gis; CALL start_gis();`
      (Only possible after the submission is merged and published.)

## Progress log

- 2026-08-05: Filed. Blocked on [T-052] (name collision with core `ui`) and
  [T-053] (still proxying to DuckDB Labs' host). Flagged the `Makefile:15`
  perl-core hack as the most likely CI surprise — test it first.

- 2026-08-05: Both blockers are done and merged to local `main`. Worked on
  branch `t-054-community-extension-submission`. Findings and state:

  **perl-core (de-risked as far as is possible locally).** The Makefile comment
  blamed "OpenSSL 3.6+"; that is wrong. `./Configure`'s `use` lines are
  byte-identical between 3.5.4 and 3.6.0, so pinning an older OpenSSL in
  `vcpkg.json` does *not* avoid the missing-module failure — and a non-default
  pin makes a binary-cache miss (an actual source build) more likely. I tried
  the pin, verified it built, and reverted it as strictly worse. The hack stays;
  the comment is corrected. Retiring it means dropping OpenSSL entirely, filed
  as [T-056] (also worth ~6.5k symbols of artifact). Note the local vcpkg is at
  `84bab45d…` — the exact commit the LTS jobs pin — and resolves openssl 3.6.0,
  so the hack is load-bearing on *every* job, not just LTS.

  **MotherDuck removed.** `src/utils/md_helpers.{cpp,hpp}`, the `/localToken`
  route + handler, `EventDispatcher::SendConnectedEvent`, and the watcher's
  MD-connected transition are gone, plus the dead `/localToken` entry in
  `frontend/vite.config.ts`. Nothing in `frontend/` or `ts/` referenced any of
  it. Verified: `make` + `unittest` green, server serves the embedded frontend
  (gzip, byte-identical to `frontend/dist/index.html`), `/localEvents` still
  200, `/ddb/run` still 401s unauthenticated.

  **Pipeline.** Every job gated `exclude_archs` and both deploy jobs on
  `github.repository == 'duckdb/duckdb-ui'`, never true here — so the deploy
  jobs were dead and CI only built linux_amd64/osx_arm64/windows_amd64. Deploy
  jobs dropped (community-extensions builds and signs from `description.yml`;
  we have no business writing to DuckDB Labs' repository). Now excludes only
  wasm, so the matrix matches what the community build will attempt. **This is
  untested and may surface failures on newly-built platforms, windows_amd64_mingw
  most likely.** Anything unfixable goes in `excluded_platforms`.

  **Artifact size — the ticket's open question is answered.** The embedded
  frontend is **0.87 MB gzipped** (`frontend/dist` is 3.4 MB raw), so the ~1 MB
  assumption held. But the stripped artifact is **36 MB**, dominated by
  statically-linked DuckDB (45,782 `duckdb::` symbols vs 6,497 OpenSSL ones);
  our own objects are ~3.9 MB total. The web app is a rounding error and is not
  a size risk. Community extensions publish comparable sizes.

  **Descriptor drafted** at `description.yml` (repo root; not read by anything
  here — it is copied into `extensions/gis/description.yml` in a fork of
  community-extensions). Schema verified against the real `h3`, `duckpgq` and
  `httpserver` descriptors, not the docs page: the field is `license`, not
  `licence` as documented, and `excluded_platforms` is a semicolon-delimited
  string under `extension:`.

  **Next, in order, and all of it needs a push:**
  1. Push `t-054-community-extension-submission` and let
     `MainDistributionPipeline.yml` run. This is the only way to test both the
     perl-core hack and the widened matrix. Expect a first-run failure.
  2. Once green, merge to `main`, tag `v0.1.0`, push the tag.
  3. Put that tag's SHA in `description.yml` `repo.ref`, then open the PR
     against `duckdb/community-extensions`.

  Naming was checked against DuckDB's trademark guidelines this session and
  settled: keep `duckdb-gis`. ~16 duck-named community extensions are already
  published, several using the full `duckdb` mark (`duckdb_mcp`,
  `duckdb_delta_sharing`), and the name entering DuckDB's namespace is the
  neutral `gis` anyway. The README now carries the trademark + non-affiliation
  notice, which is what makes the fork read as homage rather than implied
  officialdom. The `@duckdb/*` npm scope in `ts/pkgs/` stays: it is unmodified
  upstream code (no commits by us), consumed via `link:`, never published.

- 2026-08-06: Merged `t-054-community-extension-submission` (and, separately,
  `t-038-digitizing-toolbar-edit-mode-only`) to local `main` and pushed to
  `origin/main` for the first time in weeks -- CI had **never** run on this
  fork (`gh api .../actions/runs` returned 0 runs; Actions were enabled but
  nothing had ever pushed to trigger them). Explicitly did not tag or touch
  `description.yml`'s `repo.ref` -- no submission PR filed, per instruction
  not to publish yet.

  **`Frontend.yml` (dist-freshness check): now green**, after finding and
  fixing two real bugs neither of which had ever been exercised before (this
  workflow's first-ever run):
  1. `pnpm/action-setup` reads the pnpm version from `frontend/package.json`,
     which had no `packageManager` field (only `ts/package.json` did) ->
     "No pnpm version is specified." Added the field.
  2. The staleness check (`pnpm build`, diff against committed `dist/`) kept
     failing on rebuilds with *identical* source. Root-caused via a throwaway
     `debug/frontend-dist-diff` branch + `workflow_dispatch` (no artifact
     upload exists, so this was the only way to see CI's actual output) to
     two independent Tailwind v4 non-determinism issues, both now fixed:
     - Vite/Rollup's content-hashed asset filenames are not a pure content
       hash here (byte-identical JS got different hashes across consecutive
       builds) -- pinned fixed filenames via `rollupOptions.output`.
     - Tailwind's automatic content detection walks up to the repo root and
       scans everything not gitignored (pulls in `ts/`, `design-system/`,
       the `duckdb/` submodule); explicit `@source` opt-out needs the path
       scoped past `frontend/node_modules` too (a sibling of `src/`), unlike
       automatic detection which excludes `node_modules` on its own. Fixed
       with `@import "tailwindcss" source(none)` + `@source "./"` in
       `global.css`, scoped to `frontend/src` only (frontend imports nothing
       from the other workspaces, confirmed by grep).

  **`MainDistributionPipeline.yml`: running, not yet green** -- exactly the
  "expect a first-run failure" outcome anticipated above. Distinct failures
  seen across the matrix, not yet fixed (out of scope for this session):
  - `main`-branch DuckDB job (linux_arm64 build): fails on upstream API
    churn (`BaseQueryResult::names`/`types` -> `Identifier`-typed,
    `MetaTransaction` now incomplete in the header) -- the same class of
    break upstream `duckdb/duckdb-ui` fixed in its "Fix main build against
    DuckDB Identifier API" (#62, 2026-06-18). Tracking DuckDB's `main` is
    inherently best-effort; not our merge's fault.
  - `v1.5-variegata` and `v1.5.4` jobs (linux_amd64): build succeeds, but
    `test_release` fails at `require gis` in `test/sql/gis.test`:
    `Failed to create directory "/root/.duckdb/extension_data": No such
    file or directory`. Not reproduced locally (make + unittest green on
    every rebuild this session) -- looks specific to the community
    `extension-ci-tools` Docker test harness (root user, HOME handling).
    Needs investigation.
  - `v1.4-andium` (next LTS patch) and `v1.4.5` LTS `linux_amd64_musl`:
    also failed; not yet root-caused. `v1.4-andium` is exactly the
    perl-core-hack job flagged as highest-risk above -- still open whether
    that's the cause here or something else.
  - linux_arm64 jobs mostly got cancelled (superseded by later pushes
    during same-session iteration) rather than run to a real result; needs
    a clean run once amd64 is sorted.

  **Next:** this needs its own focused pass -- probably worth splitting into
  a follow-up ticket rather than folding more into T-054, since it's cross-
  cutting CI/build work rather than submission-prep proper. Do not tag or
  open the community-extensions PR until the matrix is actually green (or
  failures are consciously pushed to `excluded_platforms`).
