// ---------------------------------------------------------------------------
// Overture Maps quick-load (T-012) — data model + query seam.
//
// QGIS parallel: QuickOSM / Overpass Turbo, but for Overture. The user picks
// theme(s), a release, and an extent; each selected theme is loaded onto the
// map as its own layer via `layers.addQuery`.
//
// DATA PATH: direct read of Overture's public GeoParquet-on-S3 (no community
// extension needed) — verified against the live bucket on 2026-07-10. The
// httpfs load + anonymous S3 access are handled by `ensureOvertureAccess`
// (lib/remote.ts, T-008); this module owns the theme/release model and the
// query builder. Confirmed by inspection of the bucket:
//   - partition layout `theme=<t>/type=<ty>/` under `release/<version>/`;
//   - each row has a native `geometry` column (GEOMETRY, crs84) and a
//     `bbox` struct(xmin, xmax, ymin, ymax) used for the clip predicate.
// Note: small themes (places) read interactively; the largest themes
// (buildings/transportation) are slow over the network because the whole-planet
// file glob must be listed/pruned — acceptable for now, revisit for large extents.
// ---------------------------------------------------------------------------

import { query } from "./duckdb";
import { getMap } from "./mapBus";
import { selection, fidTaggedRelation, FID } from "./selection";
import { layers } from "./layers";
import { OVERTURE_BUCKET, ensureOvertureAccess } from "./remote";

/** One selectable Overture theme. `type` is the representative type partition
 *  loaded for the shell; per-type refinement is a later sub-ticket. */
export interface OvertureTheme {
  id: string;
  label: string;
  type: string;
}

export const OVERTURE_THEMES: OvertureTheme[] = [
  { id: "places", label: "Places", type: "place" },
  { id: "buildings", label: "Buildings", type: "building" },
  { id: "transportation", label: "Transportation", type: "segment" },
  { id: "addresses", label: "Addresses", type: "address" },
  { id: "base", label: "Base (land / water)", type: "land" },
  { id: "divisions", label: "Divisions", type: "division_area" },
];

// Available releases, latest first (verified present in the bucket 2026-07-10).
// The bucket retains only the most recent releases; live-listing them (and
// auto-preselecting the latest) is a T-012 follow-up.
export const OVERTURE_RELEASES = ["2026-06-17.0", "2026-05-20.0"];

export type ExtentMode = "viewport" | "selected" | "place";

export interface OvertureRequest {
  /** Selected theme ids (one map layer each). */
  themes: string[];
  release: string;
  extent: ExtentMode;
}

export interface Bbox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/** Above this span (degrees, in either dimension) the direct GeoParquet-on-S3
 *  read globs too many whole-planet files to load interactively — the Overture
 *  modal warns and nudges the user to zoom in (T-029). A metro-area viewport is
 *  well under this; the default world/continent view is far over it. */
export const LARGE_EXTENT_DEGREES = 5;

/** Whether a bbox is too large for the interactive direct-read path (T-029). */
export function isLargeExtent(b: Bbox): boolean {
  return b.xmax - b.xmin > LARGE_EXTENT_DEGREES || b.ymax - b.ymin > LARGE_EXTENT_DEGREES;
}

/** Bbox of the current MapLibre viewport (lon/lat), or null if no map yet. */
export function viewportBbox(): Bbox | null {
  const map = getMap();
  if (!map) return null;
  const b = map.getBounds();
  return { xmin: b.getWest(), ymin: b.getSouth(), xmax: b.getEast(), ymax: b.getNorth() };
}

/** Bbox enclosing the current selection set (T-003), or null if nothing is
 *  selected. Local query (not S3), so this works in the shell. */
export async function selectionBbox(): Promise<Bbox | null> {
  const sel = selection.query();
  if (!sel) return null;
  const rel = fidTaggedRelation(sel.sql);
  const rows = await query(
    `SELECT min(ST_XMin(geom)) AS x0, min(ST_YMin(geom)) AS y0,
            max(ST_XMax(geom)) AS x1, max(ST_YMax(geom)) AS y1
     FROM (${rel}) _s WHERE ${FID} IN (${sel.fids.join(",")})`,
  );
  const r = rows[0];
  if (!r || r.x0 == null) return null;
  return { xmin: Number(r.x0), ymin: Number(r.y0), xmax: Number(r.x1), ymax: Number(r.y1) };
}

/**
 * Build the geometry query for one theme, clipped to `bbox`. Reads Overture's
 * public GeoParquet on S3 (caller must have run `ensureOvertureAccess` first),
 * projecting `geometry` → `geom` for the render path and filtering on the
 * partition's `bbox` struct with a standard bbox-overlap predicate. The `bbox`
 * columns carry parquet statistics, so this prunes row groups server-side.
 *
 * The `::GEOMETRY` cast strips the CRS annotation that `read_parquet` attaches
 * to GeoParquet geometry (`GEOMETRY('OGC:CRS84')`): spatial's aggregate
 * functions (`any_value`, `ST_Extent_Agg`) — which the render probe uses — throw
 * a spurious "Only little-endian WKB is supported" on that CRS-tagged type for
 * polygon themes (buildings/base/divisions), while plain `GEOMETRY` (what every
 * other layer uses) works. The cast is a no-op for themes that already worked.
 */
export function buildOvertureQuery(theme: OvertureTheme, release: string, bbox: Bbox): string {
  const path = `${OVERTURE_BUCKET}/release/${release}/theme=${theme.id}/type=${theme.type}/*`;
  // Standard bbox-overlap: feature bbox intersects the requested extent.
  return (
    `SELECT geometry::GEOMETRY AS geom ` +
    `FROM read_parquet('${path}', hive_partitioning=1) ` +
    `WHERE bbox.xmin <= ${bbox.xmax} AND bbox.xmax >= ${bbox.xmin} ` +
    `AND bbox.ymin <= ${bbox.ymax} AND bbox.ymax >= ${bbox.ymin}`
  );
}

/**
 * Resolve the request's extent to a bbox, then add one query-backed layer per
 * selected theme (T-012 / T-029). Each theme's remote S3 read is materialised
 * into a local temp table *once* (a single S3 scan) inside `addQuery`'s
 * `prepare` before the layer renders from it — the render path otherwise scans
 * the source twice (probe + Arrow), which over the network doubles the wall
 * time. httpfs/S3 setup + the materialise run inside `prepare`, so any access or
 * read failure surfaces on the layer row instead of being swallowed. Mirrors the
 * geoprocessing tools' pattern (build SQL + call `layers.addQuery` in the data
 * layer; the view only routes the request here).
 */
export async function addOvertureLayers(req: OvertureRequest): Promise<void> {
  const bbox = req.extent === "selected" ? await selectionBbox() : viewportBbox();
  if (!bbox) return; // no map / empty selection — nothing to clip to
  for (const themeId of req.themes) {
    const theme = OVERTURE_THEMES.find((t) => t.id === themeId);
    if (!theme) continue;
    const id = `L_ov_${req.release}_${theme.id}`.replace(/[^A-Za-z0-9]/g, "_");
    void layers.addQuery({
      id,
      name: `Overture ${theme.label}`,
      sql: `SELECT geom FROM ${id}`,
      prepare: async () => {
        await ensureOvertureAccess();
        await query(
          `CREATE OR REPLACE TEMP TABLE ${id} AS ${buildOvertureQuery(theme, req.release, bbox)}`,
        );
      },
    });
  }
}
