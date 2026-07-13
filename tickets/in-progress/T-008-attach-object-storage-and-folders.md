---
id: T-008
title: Add object storage (S3) and folders of geo files as data sources
status: in-progress
priority: P2
area: frontend
depends_on: [T-007]
branch: t-002-sidebar-tabs
---

## Goal

Let the user add data that lives in **object storage (S3 buckets)** or in a
**folder of files** (e.g. a directory of GeoParquet/Parquet/GeoJSON), and see
it in the Browser catalog as queryable/renderable data — not just single
attached DuckDB files.

## Context

<context>
Extends the "Add data source" entry point from [[T-007]]. Two related source
kinds:
  - **Folder**: a directory of files read via globbing, e.g.
    `read_parquet('/path/*.parquet')` / `st_read('/path/*.geojson')` (spatial
    is already loaded). Could surface as a view per file or a browsable node.
  - **S3 bucket / object storage**: needs the `httpfs` extension
    (`INSTALL httpfs; LOAD httpfs;` — not currently loaded, see the extension
    bootstrap in `frontend/src/App.tsx` ~line 22–24) plus credentials via a
    DuckDB **secret** (`CREATE SECRET ... (TYPE s3, ...)`), then
    `read_parquet('s3://bucket/prefix/*.parquet')`.

Everything runs through the native `query()` path
(`frontend/src/lib/duckdb.ts`); the catalog reader is
`frontend/src/lib/catalog.ts`. Since these aren't attached databases, decide
how they appear in the Browser tree — likely a separate top-level group
("Files" / "Remote") or as created views registered in a schema so
`loadCatalog()` picks them up.

Open points (note in Progress log):
  - Credential handling/UX for S3 (access key/secret, region, or anonymous for
    public buckets like open data). Don't hardcode or log secrets.
  - Whether to register sources as views (so they show in the catalog) vs. a
    distinct source model in the sidebar.
  - Supported formats for v1 (recommend start with (Geo)Parquet, the Overture
    case in [[T-012]] depends on this S3+parquet plumbing).
</context>

## Acceptance criteria

- [ ] User can point at a local folder of geo files and query/see them.
- [ ] User can add an S3 location; `httpfs` is installed/loaded on demand and
      credentials (or anonymous access) are handled without leaking secrets.
- [ ] Added sources appear in the Browser catalog and can feed the map.
- [ ] Errors (missing extension, bad credentials, no matching files) surface
      readably.
- [ ] Frontend build/lint passes.

## Progress log

- 2026-07-09: Ticket created. Not started. The S3+GeoParquet plumbing here is a
  prerequisite for Overture quick-load ([[T-012]]).
- 2026-07-10: **S3 / httpfs read plumbing built and verified** (the slice that
  unblocks [[T-012]]; the local-folder and generic-source UX are still open).
  - `frontend/src/lib/remote.ts` — lazy, memoised `ensureHttpfs()`
    (`INSTALL httpfs; LOAD httpfs;` on first use, so startup stays lean) and
    `ensureOvertureAccess()`. State persists because the UI client uses a
    singleton connection and secrets/extensions are database-wide; the memo is
    cleared on failure so a later attempt retries.
  - **Anonymous public-bucket access, verified against live Overture S3:** a
    *scoped* secret `CREATE SECRET (TYPE s3, PROVIDER config, KEY_ID '',
    SECRET '', REGION 'us-west-2', SCOPE 's3://overturemaps-us-west-2')`.
    `PROVIDER config` is essential — the default `credential_chain` **hangs for
    minutes** probing the EC2 metadata endpoint when no real creds exist
    (reproduced). `SCOPE` keeps the region off the global setting.
  - Verified end-to-end in `build/release/duckdb`: httpfs read → bbox-clipped
    `read_parquet` → native `geometry` (GEOMETRY, crs84) → `st_asgeoarrowpoint`
    encode (797 Berlin places). Perf note: bbox filter prunes row groups via
    parquet stats, but the whole-planet *file glob* is the cost — small themes
    (places) are interactive (~12s cold), the largest (buildings/transportation)
    are minutes. Revisit for large extents (see [[T-012]]).
  - **Still open for this ticket (needs [[T-007]]'s "Add data source" entry
    point):** local folder-of-files globbing (`read_parquet`/`st_read` on a
    dir); *credentialed/private* S3 (key+secret secret UX, no secret leakage);
    registering these as browsable Browser-tree nodes / catalog views. Only the
    public-anonymous-S3 read path is done here.
