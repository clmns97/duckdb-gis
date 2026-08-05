---
id: T-055
title: Prepare duckdb-gis for listing as a DuckDB community extension
status: open
priority: P2
area: build
depends_on: [T-052, T-053]
branch:
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
  launch story from [T-054].
- Check whether the fork needs a distinct default branch / whether GitHub Actions
  behave differently on forks for the release workflow.

Open question to settle before submitting: does an extension that bundles a
~1 MB web app fit within whatever artifact size limits the pipeline enforces?
Measure the built artifact from [T-053] first.
</context>

## Acceptance criteria

- [ ] The extension builds green in `MainDistributionPipeline.yml` under the name
      `gis` for all non-excluded platforms.
- [ ] `Makefile:15` perl-core hack confirmed compatible with the community build
      image, or replaced.
- [ ] MotherDuck code path removed (or an explicit decision to keep it, recorded
      here with the reason).
- [ ] A release tag exists and the versioning scheme is written down.
- [ ] README rewritten for an outside user; license/attribution correct.
- [ ] `description.yml` PR open against `duckdb/community-extensions`.
- [ ] Verified from a clean machine/container:
      `INSTALL gis FROM community; LOAD gis; CALL start_gis();`

## Progress log

- 2026-08-05: Filed. Blocked on [T-052] (name collision with core `ui`) and
  [T-053] (still proxying to DuckDB Labs' host). Flagged the `Makefile:15`
  perl-core hack as the most likely CI surprise — test it first.
