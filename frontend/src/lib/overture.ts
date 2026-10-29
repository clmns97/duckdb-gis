// ---------------------------------------------------------------------------
// Overture Maps quick-load (T-012, #13) — theme/release model and data paths.
//
// QGIS parallel: QuickOSM / Overpass Turbo, but for Overture. The user picks
// theme(s) and a release; each theme is shown from Overture's hosted PMTiles
// (T-058, `addOvertureLayers`), so the whole planet is available by panning.
// Editing works on a copy: "Create Layer from Selection" materialises the
// picked features from Overture's public GeoParquet-on-S3 (no community
// extension needed; httpfs + anonymous S3 via `ensureOvertureAccess`,
// lib/remote.ts). Bucket layout, verified live:
//   - `release/<version>/theme=<t>/type=<ty>/*.parquet`, each row with a
//     native `geometry` column (GEOMETRY, crs84) and a `bbox` struct;
//   - Overture's STAC catalog publishes, per release, one small
//     `collections.parquet` (~150 KB) listing every data file with its bbox.
// ---------------------------------------------------------------------------

import { query, sqlLit, str, ident } from "./duckdb";
import { layers, sanitizeIdent } from "./layers";
import { OVERTURE_BUCKET, ensureOvertureAccess } from "./remote";
import { OVERTURE_TILES_BASE } from "./overtureTiles";
import { pmSelection } from "./pmtilesSelection";
import type { Bbox } from "./bbox";
import { unsavedChanges } from "./unsavedChanges";

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
 * GeoParquet bucket (globbed via DuckDB/httpfs). Sorted newest-first. Rejects
 * when listing fails or finds nothing: there is no safe fallback, because the
 * buckets rotate releases out — a pinned list aged out and silently broke
 * quick-load before (#30).
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
      if (both.length === 0) {
        throw new Error("no Overture release is in both the tiles and GeoParquet buckets");
      }
      return both;
    })().catch((e) => {
      releasesPromise = null; // let a later attempt retry
      throw e;
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
 * always fell back to a hardcoded release default — which then itself aged
 * out of the bucket (#30).
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

/** Bbox-overlap predicate on a `bbox` struct column — Overture's feature rows
 *  and its STAC file index both have one. On the GeoParquet side the column
 *  carries parquet statistics, so this prunes row groups server-side. */
function bboxOverlapClause(bbox: Bbox): string {
  return (
    `bbox.xmin <= ${bbox.xmax} AND bbox.xmax >= ${bbox.xmin} ` +
    `AND bbox.ymin <= ${bbox.ymax} AND bbox.ymax >= ${bbox.ymin}`
  );
}

const STAC_BASE = "https://stac.overturemaps.org";

/**
 * The data files of `theme` in `release` whose extent overlaps `bbox`, from the
 * release's STAC index — or null when the index can't be read (the caller then
 * globs the whole theme). Globbing costs one footer read per file before any
 * pruning: ~2 min for one building (513 files) vs ~4 s via the index (#13).
 */
async function stacFiles(theme: OvertureTheme, release: string, bbox: Bbox): Promise<string[] | null> {
  try {
    const rows = await query(
      `SELECT assets.aws.alternate.s3.href AS f ` +
        `FROM read_parquet('${STAC_BASE}/${sqlLit(release)}/collections.parquet') ` +
        `WHERE contains(assets.aws.alternate.s3.href, '/theme=${sqlLit(theme.id)}/') ` +
        `AND ${bboxOverlapClause(bbox)}`,
    );
    const files = rows.map((r) => str(r.f));
    return files.length ? files : null;
  } catch {
    return null;
  }
}

const idList = (ids: string[]) => ids.map((id) => `'${sqlLit(id)}'`).join(",");

/**
 * Materialise the *selected* features of an Overture theme from GeoParquet — the
 * "Create Layer from Selection" path (T-058). Reads `files` (from the STAC index)
 * or else every `type` partition of the theme (a source-layer's features can live
 * in more than one, so `union_by_name` reconciles the differing schemas), prunes
 * row-groups with the selection's bbox, and filters to the picked GERS `id`s —
 * real, full-resolution geometry, not the simplified tile geometry the user
 * selected on.
 *
 * The `::GEOMETRY` cast strips the CRS annotation that `read_parquet` attaches
 * to GeoParquet geometry (`GEOMETRY('OGC:CRS84')`): spatial's aggregate
 * functions (`any_value`, `ST_Extent_Agg`) — which the render probe uses — throw
 * a spurious "Only little-endian WKB is supported" on that CRS-tagged type for
 * polygon themes (buildings/base/divisions), while plain `GEOMETRY` (what every
 * other layer uses) works.
 */
function buildOvertureSelectionQuery(
  theme: OvertureTheme,
  release: string,
  bbox: Bbox,
  ids: string[],
  files: string[] | null,
): string {
  const src = files
    ? `[${files.map((f) => `'${sqlLit(f)}'`).join(",")}]`
    : `'${OVERTURE_BUCKET}/release/${release}/theme=${theme.id}/type=*/*'`;
  return (
    `SELECT geometry::GEOMETRY AS geom, * EXCLUDE (geometry) ` +
    `FROM read_parquet(${src}, hive_partitioning=1, union_by_name=1) ` +
    `WHERE ${bboxOverlapClause(bbox)} AND id IN (${idList(ids)})`
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

/** Above this span (degrees, either axis) a selection's bbox gets a confirm
 *  before it's materialised: it can mean many full-resolution features to
 *  read and render (T-029). A city is well under this; a country is over it. */
const LARGE_EXTENT_DEGREES = 5;

export function isLargePmSelection(): boolean {
  const b = pmSelection.bounds();
  return (
    b != null && (b.xmax - b.xmin > LARGE_EXTENT_DEGREES || b.ymax - b.ymin > LARGE_EXTENT_DEGREES)
  );
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
  const files = await stacFiles(theme, release, bbox);
  await query(
    `CREATE TABLE main.${ident(table)} AS ${buildOvertureSelectionQuery(theme, release, bbox, ids, files)}`,
  );
  unsavedChanges.markDirty(); // wrote a new working-catalog table outside any edit session (#67)
  const dbRows = await query(`SELECT current_database() AS db`);
  const db = str(dbRows[0]?.db ?? "memory");
  await layers.add({ db, schema: "main", table, geomColumn: "geom" });
}
