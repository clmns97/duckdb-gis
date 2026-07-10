---
id: T-008
title: Add object storage (S3) and folders of geo files as data sources
status: open
priority: P2
area: frontend
depends_on: [T-007]
branch:
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
