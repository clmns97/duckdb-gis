---
id: T-057
title: Get MainDistributionPipeline.yml green across the build matrix
status: in-progress
priority: P1
area: build
depends_on: []
branch: t-057-main-distribution-pipeline-not-green
---

## Goal

`MainDistributionPipeline.yml` builds and tests the `gis` extension green for
every DuckDB version/platform combination it targets (or failures are
consciously pushed to `description.yml`'s `excluded_platforms`, not silently
left red). [T-054] is blocked on this: the community-extensions submission PR
should not be opened until the matrix is actually green.

## Context

<context>
This is the very first time CI has ever run on this fork
(`clmns97/duckdb-gis`) — `gh api repos/clmns97/duckdb-gis/actions/runs` showed
`0` total runs before 2026-08-06, despite Actions being enabled, because
nothing had ever been pushed to `origin/main` in weeks. [T-054] fixed the
pipeline config to actually apply to this fork (dropped the two
`duckdb/duckdb-ui`-gated deploy jobs, widened the arch matrix to match what
community-extensions will build) but that was never exercised until today's
push. Run: https://github.com/clmns97/duckdb-gis/actions/runs/31081888177
(commit `a728ed6`; later pushes cancelled/superseded it, but the failures
below are representative — same source modulo unrelated frontend/dist fixes).

**Primary blocker, affects 4 of 5 build jobs identically — root-caused, fix
not yet written:**

`src/ui_extension.cpp:106-107`, in `LoadInternal` (runs on every extension
load, unconditionally):

```cpp
fs.CreateDirectory(fs.ExpandPath("~/.duckdb/extension_data"));
fs.CreateDirectory(fs.ExpandPath("~/.duckdb/extension_data/gis"));
```

`LocalFileSystem::CreateDirectory` (`duckdb/src/common/local_file_system.cpp:633`)
is a single-level `mkdir`, not recursive — it throws `IOException` if the
parent doesn't exist. This code assumes `~/.duckdb` already exists, which is
true on any machine that has ever run `INSTALL` for any extension (true of
every dev machine and presumably upstream `duckdb-ui`'s own test setup), so
it's never been exercised against a genuinely fresh home directory before.
The community CI's Docker test containers start with no `~/.duckdb`, so
`test/sql/gis.test:5`'s `require gis` throws immediately:

```
IO Error: Failed to create directory "/root/.duckdb/extension_data": No such
file or directory
```

**This is a real first-run bug, not just a CI artifact.** [T-054]'s own goal
is `INSTALL gis FROM community; LOAD gis;` working "for a user who has never
seen this repo" — that is exactly the fresh-`~/.duckdb` scenario this crashes
on. Anyone installing the published extension for the first time, on a
machine that has never run `INSTALL`/`LOAD` for anything else, would hit this.

Confirmed hitting identically (same error, same line) in:
- `Build GIS extension for next patch (v1.5-variegata) / linux_amd64` (job 92552387400)
- `Build GIS extension for DuckDB v1.5.4 / linux_amd64` (job 92552392317)
- `Build GIS extension binaries for next LTS patch (v1.4-andium) / linux_amd64` (job 92552408962) —
  this is *not* the perl-core hack; that step (installing `perl-core` +
  building OpenSSL) succeeded, build completed, only the test step failed on
  the same `extension_data` error.
- `Build GIS extension for DuckDB v1.4.5 (LTS) / linux_amd64_musl` (job 92552393234)

Likely fix: create `~/.duckdb` itself before its children, e.g.:
```cpp
fs.CreateDirectory(fs.ExpandPath("~/.duckdb"));
fs.CreateDirectory(fs.ExpandPath("~/.duckdb/extension_data"));
fs.CreateDirectory(fs.ExpandPath("~/.duckdb/extension_data/gis"));
```
Check what `extension_data/gis` is actually used for (grep `ui_extension.cpp`
and callers) before changing behavior beyond the directory creation — this
code is largely inherited from upstream `duckdb-ui` and may be used elsewhere
in this LoadInternal function or in `state.cpp`/`settings.cpp`. Verify the fix
by testing `LOAD gis` against a `HOME` pointed at an empty scratch directory
locally (reproduces the fresh-checkout condition without needing Docker).

**Secondary, separate issue — `main`-branch DuckDB job only:**

`Build GIS extension for main branch / linux_arm64` (job 92552403943) fails at
*build*, not test, on DuckDB main's API churn:
```
src/http_server.cpp:599: error: invalid initialization of reference of type
  'const std::string&' from expression of type 'duckdb::Identifier'
src/http_server.cpp:599,600,627,628: 'names'/'types' is private within this context
src/http_server.cpp:612: incomplete type 'duckdb::MetaTransaction'
src/watcher.cpp:21: invalid use of incomplete type 'class duckdb::DatabaseManager'
src/ui_extension.cpp:147, src/include/utils/helpers.hpp:112: table_function_bind_t
  signature now takes vector<Identifier>&, not vector<string>&
```
`BaseQueryResult::names`/`types` moved from `vector<string>` to
`vector<Identifier>` and are now private (accessor needed) on DuckDB `main`.
Upstream `duckdb/duckdb-ui` hit and fixed the identical break: "Fix main build
against DuckDB Identifier API" (#62, merged 2026-06-18) — worth diffing that
commit against our `http_server.cpp`/`watcher.cpp`/`ui_extension.cpp` for the
exact API adaptation, since our files have diverged from upstream (MotherDuck
strip, gis naming) but this section likely didn't. Tracking DuckDB `main` is
inherently best-effort and may need periodic upkeep going forward, not a
one-time fix.

**Not yet investigated:**

- `linux_arm64` jobs across the matrix mostly got cancelled mid-session
  (superseded by rapid pushes while iterating on Frontend.yml fixes) rather
  than run to completion — need a clean full run once the amd64 blocker above
  is fixed, to see real arm64 results (may just inherit the same two bugs
  above, or may have arch-specific issues of its own).
- macOS/Windows/wasm jobs are entirely `skipped` in every run so far — check
  whether that's expected gating (e.g. only runs on certain triggers) or
  something to fix. wasm is deliberately excluded (threaded HTTP server, see
  `MainDistributionPipeline.yml` header comment); macOS/Windows should not be.
</context>

## Acceptance criteria

- [x] `~/.duckdb/extension_data/gis` creation in `ui_extension.cpp` survives
      a fresh (no pre-existing `~/.duckdb`) home directory, verified locally
      against a scratch `HOME`.
- [ ] `main`-branch DuckDB job builds again (adapted to the `Identifier` API,
      referencing upstream's #62 fix).
- [ ] A full, uncancelled `MainDistributionPipeline.yml` run on `main` is
      green for every job that isn't in `excluded_platforms` — or remaining
      red jobs are deliberately moved to `excluded_platforms` in
      `description.yml` with a documented reason, not left red.
- [ ] `make` + `./build/release/test/unittest` still pass locally.

## Progress log

- 2026-08-06: Filed after the first-ever CI run on this fork surfaced these
  failures (see run 31081888177, commit `a728ed6`). Root-caused the primary
  blocker (non-recursive `CreateDirectory` on a since-nonexistent
  `~/.duckdb`) down to the exact line and confirmed it hits 4 of 5 build
  jobs identically; root-caused the `main`-branch build break to DuckDB's
  `Identifier` API change, matching a fix upstream `duckdb-ui` already made.
  Split out of [T-054], which is blocked on this.

- 2026-08-06: Fixed the primary blocker. `DuckDB::FileSystem` already has a
  `CreateDirectoriesRecursive` helper (`duckdb/src/common/file_system.cpp:504`,
  declared in `file_system.hpp:189`) built for exactly this ("Helper function
  that uses DirectoryExists and CreateDirectory to ensure all directories in
  path are created") -- swapped the two single-level `CreateDirectory` calls
  for one `CreateDirectoriesRecursive` call. Also confirmed
  `~/.duckdb/extension_data/gis` is currently unused elsewhere in our code
  (`grep -rn extension_data src/` only matched this one spot) -- it's pure
  scaffolding, presumably inherited from upstream for future use, so there
  was no other behavior to preserve.

  Verified the repro and the fix directly rather than round-tripping through
  CI: built with the old code, ran `HOME=/tmp/scratch_home ./build/release/duckdb
  -c "LOAD '.../gis.duckdb_extension'"` against an empty scratch home and hit
  the exact same `IO Error: Failed to create directory
  "/tmp/scratch_home/.duckdb/extension_data": No such file or directory` CI
  produced. Rebuilt with the fix: loads clean, `extension_data/gis` gets
  created. `./build/release/test/unittest` passes both with a normal `$HOME`
  and with `HOME` pointed at a fresh scratch directory (18 assertions either
  way).

  Not yet done: the `main`-branch DuckDB API-churn fix, and a clean full CI
  matrix run to see what (if anything) is still red after this.

- 2026-08-06: Merged to `main`, pushed, and got a full uncancelled matrix run
  (31086136702) for the first time this session -- earlier runs had all been
  superseded/cancelled mid-flight while iterating on `Frontend.yml`. Result:
  the primary fix is confirmed -- **all four** previously-failing
  `linux_amd64`/`linux_amd64_musl` test jobs (v1.5-variegata, v1.5.4,
  v1.4-andium, v1.4.5 LTS) are now green. New failures surfaced now that the
  matrix actually ran to completion (never seen before this run):
  - `main`-branch / `linux_arm64`: the already-known-and-expected DuckDB
    `Identifier` API churn (build failure, not test). Not yet fixed.
  - `v1.5.4` / `MacOS osx_arm64`: `curl: (7) Failed to connect to github.com
    port 443` during checkout -- a plain network flake, not our code. Expect
    this to pass on rerun; not investigating further unless it recurs.
  - `v1.4-andium` **and** `v1.4.5` LTS / `Windows windows_amd64`: **the exact
    same** `extension_data` `IO Error` as the Linux bug, still happening
    *after* the `CreateDirectoriesRecursive` fix:
    `Failed to create directory "C:\Users\runneradmin/.duckdb/extension_data/gis"`.
    Root cause: that path mixes backslash (from `ExpandPath("~")`, which
    returns a native Windows path) and forward slash (hardcoded in our
    `"~/.duckdb/extension_data/gis"` string literal). `Path::FromString`
    picks its separator from the *first* slash character it finds in the raw
    string and rebuilds every segment with that one separator on `ToString()`
    -- with a leading `C:\`, first-slash detection and drive-prefix handling
    interact badly with the later forward slashes. Rather than fully
    tracing DuckDB's `Path`/`Path::FromString` internals (no Windows box
    here to test against directly), switched to the pattern already used
    elsewhere in DuckDB: expand `~` alone (native path, single separator
    style) and `JoinPath` the remaining segments on top, instead of
    concatenating a literal `/` onto an expanded native path. Verified on
    Linux (repeat of the earlier scratch-`HOME` check, still green) but
    **not yet verified on Windows CI** -- that's the next push.

- 2026-08-06: Pushed the Windows fix, got a full uncancelled run (31092584303).
  **Introduced a real regression in that same fix**: used
  `fs.JoinPath(a, b, c, d)`, the variadic N-arg template overload, which
  doesn't exist on the older `FileSystem` header this extension still
  supports -- `v1.4.5` LTS / `linux_arm64` failed to *compile*:
  `error: no matching function for call to 'duckdb::FileSystem::JoinPath(
  std::string, const char [8], const char [15], const char [4])'`
  (confirmed `v1.4-andium`/`linux_arm64` hit the identical error via
  fail-fast matrix cancellation of its sibling amd64/musl jobs before they
  could even run). The 2-arg `JoinPath(a, b)` base overload is old/stable
  across every supported version; switched to three chained 2-arg calls
  instead of the variadic one. `CreateDirectoriesRecursive` itself was not
  implicated (no separate error for it in the same build log) so that part
  of the fix stands. Re-verified locally (same scratch-`HOME` check, still
  green) and re-pushed. `main`-branch/`linux_arm64` still fails on the
  already-known `Identifier` API churn (unrelated, not yet fixed) --
  everything else in the last run was fail-fast cancellations of that same
  arm64 breakage's sibling jobs, not new information. Next push should
  finally show a real, complete picture of what (if anything) is left.
