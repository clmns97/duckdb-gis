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

import { query, sqlLit, str } from "./duckdb";
import { layers, ident, sanitizeIdent } from "./layers";
import { OVERTURE_BUCKET, ensureOvertureAccess } from "./remote";
import { OVERTURE_TILES_BASE } from "./overtureTiles";
import { pmSelection } from "./pmtilesSelection";

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

// Fallback releases (latest first) if live-listing fails. `2026-08-19.0` is
// current in both buckets as of 2026-09-08 (verified live) — but this is only
// a fallback: `listOvertureReleases` normally supersedes it, and buckets
// rotate their published releases over time, so this value *will* go stale
// again. Its staleness silently broke quick-load once already (#30) because
// live-listing itself was broken (see `listParquetReleases`) and always fell
// through to here; that bug is fixed, so this constant going stale should no
// longer be user-visible, only a slower first release-list round-trip.
export const OVERTURE_RELEASES = ["2026-08-19.0", "2026-07-22.0"];

export interface OvertureRequest {
  /** Selected theme ids (one PMTiles map layer each). */
  themes: string[];
  release: string;
}

// Memoised like `ensureOvertureAccess` (remote.ts): the release set is
// effectively static for the session (new Overture releases ship monthly), so
// the modal reopening shouldn't re-hit S3 + re-glob GeoParquet every time.
let releasesPromise: Promise<string[]> | null = null;

/**
 * Live-list Overture releases that can be *both* displayed and materialised:
 * the intersection of the hosted-tiles bucket (browser-listed over CORS) and the
 * GeoParquet bucket (globbed via DuckDB/httpfs). Sorted newest-first. Falls back
 * to {@link OVERTURE_RELEASES} on any failure so the modal always has options.
 */
export function listOvertureReleases(): Promise<string[]> {
  if (!releasesPromise) {
    releasesPromise = (async () => {
      const origin = new URL(OVERTURE_TILES_BASE).origin;
      const [tileReleases, parquetReleases] = await Promise.all([
        listTileReleases(origin),
        listParquetReleases(),
      ]);
      const both = tileReleases.filter((r) => parquetReleases.has(r));
      both.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // newest first
      return both.length ? both : OVERTURE_RELEASES;
    })().catch(() => {
      releasesPromise = null; // let a later attempt retry
      return OVERTURE_RELEASES;
    });
  }
  return releasesPromise;
}

/** Release ids under the hosted-tiles bucket's `tiles/` prefix (S3 ListBucket). */
async function listTileReleases(origin: string): Promise<string[]> {
  const res = await fetch(`${origin}/?list-type=2&prefix=tiles/&delimiter=/`);
  const xml = await res.text();
  const out: string[] = [];
  for (const m of xml.matchAll(/<Prefix>tiles\/([^/<]+)\/<\/Prefix>/g)) out.push(m[1]);
  return out;
}

/**
 * Release ids present in the Overture GeoParquet bucket (via DuckDB glob).
 *
 * `glob('.../release/*')` — one level deep — always returns 0 rows: S3 has no
 * real directories, so DuckDB's glob only matches actual object keys, and no
 * object is named exactly `release/<version>` with nothing after it (every
 * real object is `release/<version>/theme=.../type=.../*.parquet`). Verified
 * live against the bucket: this silently broke release discovery entirely,
 * so {@link listOvertureReleases}'s intersection was always empty and it
 * always fell back to the hardcoded {@link OVERTURE_RELEASES} default — which
 * then itself aged out of the bucket (#30).
 *
 * Fix: glob deep enough to hit real objects. Scoped to one theme/type
 * (`divisions`/`division_area`, the smallest — 8 files/release, verified) so
 * this stays a cheap listing rather than a scan of every theme.
 */
async function listParquetReleases(): Promise<Set<string>> {
  await ensureOvertureAccess();
  const rows = await query(
    `SELECT file FROM glob('${OVERTURE_BUCKET}/release/*/theme=divisions/type=division_area/*')`,
  );
  const set = new Set<string>();
  for (const r of rows) {
    const m = /\/release\/([^/]+)\/theme=/.exec(String(r.file));
    if (m) set.add(m[1]);
  }
  return set;
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

/** Standard bbox-overlap predicate against a partition's `bbox` struct column
 *  (the `bbox` columns carry parquet statistics, so this prunes row groups
 *  server-side). Shared by both query builders below. */
function bboxOverlapClause(bbox: Bbox): string {
  return (
    `bbox.xmin <= ${bbox.xmax} AND bbox.xmax >= ${bbox.xmin} ` +
    `AND bbox.ymin <= ${bbox.ymax} AND bbox.ymax >= ${bbox.ymin}`
  );
}

/**
 * Build the geometry query for one theme, clipped to `bbox`. Reads Overture's
 * public GeoParquet on S3 (caller must have run `ensureOvertureAccess` first),
 * projecting `geometry` → `geom` for the render path and filtering on the
 * partition's `bbox` struct with a standard bbox-overlap predicate.
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
  return (
    `SELECT geometry::GEOMETRY AS geom ` +
    `FROM read_parquet('${path}', hive_partitioning=1) ` +
    `WHERE ${bboxOverlapClause(bbox)}`
  );
}

/**
 * Materialise the *selected* features of an Overture theme from GeoParquet — the
 * "Create Layer from Selection" path (T-058). Globs every `type` partition of the
 * theme (a source-layer's features can live in more than one, so `union_by_name`
 * reconciles the differing schemas), prunes row-groups with the selection's bbox,
 * and filters to the picked GERS `id`s — real, full-resolution geometry, not the
 * simplified tile geometry the user selected on. See `buildOvertureQuery` for the
 * `::GEOMETRY` cast rationale.
 */
export function buildOvertureSelectionQuery(
  theme: OvertureTheme,
  release: string,
  bbox: Bbox,
  ids: string[],
): string {
  const path = `${OVERTURE_BUCKET}/release/${release}/theme=${theme.id}/type=*/*`;
  const idList = ids.map((id) => `'${sqlLit(id)}'`).join(",");
  return (
    `SELECT geometry::GEOMETRY AS geom, * EXCLUDE (geometry) ` +
    `FROM read_parquet('${path}', hive_partitioning=1, union_by_name=1) ` +
    `WHERE ${bboxOverlapClause(bbox)} AND id IN (${idList})`
  );
}

/**
 * Add one native-vector PMTiles layer per selected theme (T-058). All six themes
 * go through one code path — Overture's hosted, pre-simplified tiles render on the
 * GPU with no client-side triangulation (the T-029 freeze), and stay responsive
 * while panning. The layer is display + selection only; editing happens on a copy
 * made by `createLayerFromSelection`.
 */
export function addOvertureLayers(req: OvertureRequest): void {
  for (const themeId of req.themes) {
    const theme = OVERTURE_THEMES.find((t) => t.id === themeId);
    if (!theme) continue;
    void layers.addPmtiles(theme, req.release);
  }
}

/** A selection large enough to risk reintroducing T-029's freeze when
 *  materialised (mirrors {@link isLargeExtent} on the union bbox). */
export function isLargePmSelection(): boolean {
  const b = pmSelection.bounds();
  return b != null && isLargeExtent(b);
}

/**
 * Materialise the current PMTiles selection into a normal, **editable** layer —
 * QGIS's "save layer from selected features". Creates a real catalog table in
 * `main` from a fresh GeoParquet query, then registers it via `layers.add` (the
 * catalog-table path, so Edit/Symbology work exactly as for any other table —
 * mirrors `editing.ts`'s "commit new layer"). No-op when nothing is selected.
 * The caller (Layers panel) owns the large-selection warning
 * ({@link isLargePmSelection}).
 */
export async function createLayerFromSelection(theme: OvertureTheme, release: string): Promise<void> {
  const ids = pmSelection.ids();
  const bbox = pmSelection.bounds();
  if (ids.length === 0 || !bbox) return;
  await ensureOvertureAccess();
  const stamp = Date.now().toString(36);
  const table = `${sanitizeIdent(theme.label)}_selection_${stamp}`;
  await query(
    `CREATE TABLE main.${ident(table)} AS ${buildOvertureSelectionQuery(theme, release, bbox, ids)}`,
  );
  const dbRows = await query(`SELECT current_database() AS db`);
  const db = str(dbRows[0]?.db ?? "memory");
  await layers.add({ db, schema: "main", table, geomColumn: "geom" });
}
