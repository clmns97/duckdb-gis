---
id: T-011
title: Layer information & metadata panel
status: open
priority: P3
area: frontend
depends_on: [T-001]
branch:
---

## Goal

Show information and metadata about a selected layer — the read-only
"Information" / "Metadata" side of QGIS's **Layer Properties**: source
db/schema/table, geometry type, feature count, columns/attributes and their
types, spatial extent (bbox), and CRS if known.

## Context

<context>
UX reference: QGIS **Layer Properties ▸ Information / Metadata** tabs. This is
mostly read-only display, distinct from styling ([[T-010]]) but sharing the
same "Layer Properties" surface — design them together.

Data sources for this (all via the native `query()` path,
`frontend/src/lib/duckdb.ts`):
  - Source identity + columns: `duckdb_columns()` / `duckdb_tables()` (the
    catalog already reads these, `frontend/src/lib/catalog.ts`), including the
    geometry column(s) surfaced by [[T-001]].
  - Feature count: `SELECT count(*) FROM <layer source>`.
  - Extent / bbox: spatial is loaded — `ST_Extent`-family over the geometry
    column.
  - Geometry type + CRS: from column type / spatial functions where available
    (CRS may be unknown for plain GEOMETRY — show "unknown" gracefully).

Open points:
  - Cost of feature count / extent on large tables — consider lazy / on-demand
    computation rather than eager on selection.
</context>

## Acceptance criteria

- [ ] Selecting a layer shows: source db/schema/table, geometry type, feature
      count, attribute columns + types, and spatial extent.
- [ ] CRS shown when known, graceful fallback when not.
- [ ] Heavy computations (count/extent) don't block the UI on large tables.
- [ ] Frontend build/lint passes.

## Progress log

- 2026-07-09: Ticket created. Not started. Co-design the "Layer Properties"
  surface with [[T-010]].
- 2026-07-13: Done, built together with [[T-010]] on one Layer Properties
  dialog (Information + Symbology tabs), opened from the Layers-panel context
  menu ("Layer properties…"). Implementation:
  - `lib/layers.ts`: `loadLayerInfo(layer)` — columns + types from
    `duckdb_columns()`, feature count + `ST_GeometryType` in one round-trip;
    extent reuses the add-time bounds (no recompute). Computed **lazily** when
    the Information tab mounts (not eagerly on selection), so a costly
    count/extent on a large table doesn't block the UI — the tab shows a
    loading state and guards against a late resolve after close.
  - `components/LayerProperties.tsx` (Information tab): source db.schema.table,
    geometry column, geometry type, feature count, extent, CRS, and an
    attributes table.
  - CRS: layers are lon/lat today, shown as "EPSG:4326 (assumed)"; genuine
    per-layer CRS is unknown for plain GEOMETRY — revisit when reprojection
    lands. Query-backed layers (Overture) show what's known (name/extent) and
    note attributes aren't resolved without re-running the query.
  - `tsc --noEmit` + `vite build` pass. Runtime not driven end-to-end.
