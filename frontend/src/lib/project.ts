// ---------------------------------------------------------------------------
// Project files — Save/Open a session as a plain `.duckdb` file (#33).
//
// A project *is* the working database (ADR-0001): Save materialises the
// `memory` catalog into a file via `COPY FROM DATABASE`, plus a reserved
// `_gis` metadata schema (project/layers/style) we own and version. Open does
// the reverse — attach, detect `_gis` (that's what distinguishes a project
// from a plain `.duckdb`, #8), copy its tables back into a *fresh* `memory`,
// then rebuild the layers store, styles, basemap and camera from `_gis.*`.
//
// Open fully replaces the working set (COPY FROM DATABASE errors on any table
// name collision — verified by spike — so the destination has to start empty).
// That matches "Open restores a session", not "merge a session in".
// ---------------------------------------------------------------------------

import { query, str, sqlLit, errMsg, ident } from "./duckdb";
import { layers, type ActiveLayer, type LayerStyle } from "./layers";
import type { OvertureTheme } from "./overture";
import { WORKING_CATALOG } from "./workspace";
import { basemap } from "./basemaps";
import { getMap } from "./mapBus";
import { editing } from "./editing";
import { attach } from "./attach";
import { unsavedChanges } from "./unsavedChanges";

export const PROJECT_SCHEMA_VERSION = 1;

/** Thrown by {@link openProject} when the target is a project, the working
 *  catalog has unsaved changes, and the caller didn't pass `force: true`
 *  (#67) — replacing the working set would silently discard them. The caller
 *  is expected to confirm with the user and retry with `force: true`. */
export class UnsavedChangesError extends Error {
  constructor() {
    super("Opening this project will discard unsaved changes in the current session.");
    this.name = "UnsavedChangesError";
  }
}

// Fixed, reserved aliases for the file being saved/opened — never left
// attached past the end of the operation (always detached in a `finally`), so
// collisions with a user's own attach are not a real concern in practice.
const SAVE_ALIAS = "__gis_project_save";
const OPEN_ALIAS = "__gis_project_open";

type SourceKind = "table" | "query" | "pmtiles";

/** Quote a value for SQL, or `NULL` when absent. */
function sqlValue(v: unknown): string {
  return v == null ? "NULL" : typeof v === "string" ? `'${sqlLit(v)}'` : String(v);
}
function nullableStr(v: unknown): string | null {
  return v == null ? null : str(v);
}
function g(alias: string, table: string): string {
  return `${ident(alias)}._gis.${ident(table)}`;
}

/**
 * Drop every existing object in `alias` so a fresh `COPY FROM DATABASE` into
 * it can't collide with a prior save — re-saving to the same path is the
 * common case. `main` itself can't be dropped (DuckDB treats it as an
 * internal system schema), so its contents are dropped individually; every
 * other schema (in particular a prior `_gis`) is dropped wholesale.
 */
async function clearDatabase(alias: string): Promise<void> {
  const inDb = `database_name = '${sqlLit(alias)}'`;
  const mainObjects = [
    ["VIEW", `SELECT view_name AS n FROM duckdb_views() WHERE ${inDb} AND schema_name = 'main' AND NOT internal`],
    ["TABLE", `SELECT table_name AS n FROM duckdb_tables() WHERE ${inDb} AND schema_name = 'main' AND NOT internal`],
    ["SEQUENCE", `SELECT sequence_name AS n FROM duckdb_sequences() WHERE ${inDb} AND schema_name = 'main'`],
  ];
  for (const [kind, sql] of mainObjects) {
    for (const r of await query(sql)) await query(`DROP ${kind} ${ident(alias)}.main.${ident(str(r.n))}`);
  }
  const schemas = await query(
    `SELECT schema_name AS n FROM duckdb_schemas() WHERE ${inDb} AND NOT internal AND schema_name <> 'main'`,
  );
  for (const r of schemas) await query(`DROP SCHEMA ${ident(alias)}.${ident(str(r.n))} CASCADE`);
}

export interface ProjectCamera {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/**
 * Save the current session as a project file at `path` (created if it
 * doesn't exist; overwritten in place if it does). Materialises the working
 * catalog's tables plus a populated `_gis` schema (project/layers/style).
 *
 * Scope (per #29/#33): a `table` layer backed by the working catalog is
 * copied with the rest of `memory`. A `table` layer backed by an *attached*
 * source is recorded as an external reference (db/schema/table + the
 * source's on-disk path) rather than copied — reopening the project
 * best-effort reattaches it. `query` layers round-trip via their stored SQL.
 * `pmtiles` layers (Overture's hosted tiles) round-trip via theme + release —
 * always external, re-fetched on Open, never copied. The single `preview`
 * slot (SQL-editor Run result) is transient and is not saved.
 */
export async function saveProject(opts: { path: string; name: string }): Promise<void> {
  const path = opts.path.trim();
  if (!path) throw new Error("Enter a file path to save to.");
  const name = opts.name.trim() || "Untitled project";

  const map = getMap();
  const center = map?.getCenter();
  const camera: ProjectCamera = {
    lng: center?.lng ?? 0,
    lat: center?.lat ?? 0,
    zoom: map?.getZoom() ?? 0,
    bearing: map?.getBearing() ?? 0,
    pitch: map?.getPitch() ?? 0,
  };
  const basemapId = basemap.id;
  const savedLayers = layers.list().filter((l) => l.kind !== "preview");

  // Resolve on-disk paths for any attached (non-working-catalog) sources up
  // front, in one round-trip, for the external-reference rows below.
  const dbPaths = new Map<string, string>();
  for (const r of await query(`SELECT database_name AS db, path AS p FROM duckdb_databases()`)) {
    if (r.p != null) dbPaths.set(str(r.db), str(r.p));
  }

  try {
    await query(`ATTACH '${sqlLit(path)}' AS ${ident(SAVE_ALIAS)}`);
  } catch (e) {
    throw new Error(`Could not open "${path}" for writing: ${errMsg(e)}`);
  }
  try {
    await clearDatabase(SAVE_ALIAS);
    await query(`COPY FROM DATABASE ${ident(WORKING_CATALOG)} TO ${ident(SAVE_ALIAS)}`);
    await writeMetadata(SAVE_ALIAS, { name, camera, basemapId, layers: savedLayers, dbPaths });
  } finally {
    await query(`DETACH ${ident(SAVE_ALIAS)}`).catch(() => {});
  }
  // The working catalog now matches what's on disk — *except* an uncommitted
  // Terra Draw draft (drawn but not yet committed via the digitizing
  // toolbar's own Save), which was never in `memory` for COPY FROM DATABASE
  // to pick up. Leave dirty set in that case (#67) — this project Save did
  // not actually capture it.
  if (!(editing.isEditing() && editing.featureCount > 0)) unsavedChanges.clear();
}

async function writeMetadata(
  alias: string,
  data: {
    name: string;
    camera: ProjectCamera;
    basemapId: string;
    layers: ActiveLayer[];
    dbPaths: Map<string, string>;
  },
): Promise<void> {
  await query(`CREATE SCHEMA ${ident(alias)}._gis`);

  await query(`CREATE TABLE ${g(alias, "project")} (
    schema_version INTEGER,
    name TEXT,
    center_lng DOUBLE, center_lat DOUBLE, zoom DOUBLE, bearing DOUBLE, pitch DOUBLE,
    basemap_id TEXT,
    created_at TIMESTAMP, modified_at TIMESTAMP
  )`);
  const { camera } = data;
  await query(`INSERT INTO ${g(alias, "project")} VALUES (
    ${PROJECT_SCHEMA_VERSION}, '${sqlLit(data.name)}',
    ${camera.lng}, ${camera.lat}, ${camera.zoom}, ${camera.bearing}, ${camera.pitch},
    '${sqlLit(data.basemapId)}', now(), now()
  )`);

  await query(`CREATE TABLE ${g(alias, "layers")} (
    id TEXT, name TEXT, source_kind TEXT, z_order INTEGER, visible BOOLEAN,
    source_db TEXT, source_schema TEXT, source_table TEXT, source_geom_column TEXT,
    external BOOLEAN, source_path TEXT,
    sql TEXT,
    pmtiles_theme TEXT, pmtiles_theme_label TEXT, pmtiles_theme_type TEXT, pmtiles_release TEXT
  )`);
  await query(`CREATE TABLE ${g(alias, "style")} (layer_id TEXT, style JSON)`);

  for (let i = 0; i < data.layers.length; i++) {
    const layer = data.layers[i];
    const row = layerRow(layer, data.dbPaths);
    if (!row) continue; // nothing persistable (e.g. a query layer that never resolved its SQL)

    const cols = {
      id: layer.id,
      name: layer.name,
      z_order: i,
      visible: layer.visible,
      external: false,
      ...row,
    };
    await query(
      `INSERT INTO ${g(alias, "layers")} (${Object.keys(cols).join(", ")}) ` +
        `VALUES (${Object.values(cols).map(sqlValue).join(", ")})`,
    );

    if (layer.style) {
      await query(
        `INSERT INTO ${g(alias, "style")} VALUES ('${sqlLit(layer.id)}', '${sqlLit(JSON.stringify(layer.style))}'::JSON)`,
      );
    }
  }
}

// A layer's source-specific `_gis.layers` columns; columns left out are NULL.
// Null when there's nothing persistable.
function layerRow(layer: ActiveLayer, dbPaths: Map<string, string>): Record<string, unknown> | null {
  const { source, pmtiles } = layer;
  if (layer.kind === "table" && source) {
    const external = source.db !== WORKING_CATALOG;
    return {
      source_kind: "table",
      source_db: source.db,
      source_schema: source.schema,
      source_table: source.table,
      source_geom_column: source.geomColumn,
      external,
      source_path: external ? (dbPaths.get(source.db) ?? null) : null,
    };
  }
  if (layer.kind === "query" && layer.sql) return { source_kind: "query", sql: layer.sql };
  if (layer.kind === "pmtiles" && pmtiles) {
    return {
      source_kind: "pmtiles",
      pmtiles_theme: pmtiles.theme.id,
      pmtiles_theme_label: pmtiles.theme.label,
      pmtiles_theme_type: pmtiles.theme.type,
      pmtiles_release: pmtiles.release,
    };
  }
  return null;
}

/**
 * Open a `.duckdb` file. If it carries our `_gis` schema, restore it as a
 * project (replacing the current working session); otherwise fall back to a
 * plain read-only attach (#8) — `_gis`'s presence is the only thing that
 * distinguishes the two, per #33/#8.
 *
 * Throws {@link UnsavedChangesError} instead of restoring if the target is a
 * project and the current working catalog has unsaved changes (#67) — pass
 * `force: true` (after confirming with the user) to discard them and proceed.
 * The plain-attach fallback never discards anything, so it's never gated.
 */
export async function openProject(
  path: string,
  opts: { force?: boolean } = {},
): Promise<"project" | "attached"> {
  const p = path.trim();
  if (!p) throw new Error("Enter a file path to open.");

  try {
    await query(`ATTACH '${sqlLit(p)}' AS ${ident(OPEN_ALIAS)} (READ_ONLY)`);
  } catch (e) {
    throw new Error(`Could not open "${p}": ${errMsg(e)}`);
  }

  const gisRows = await query(
    `SELECT 1 AS x FROM duckdb_schemas() WHERE database_name = '${sqlLit(OPEN_ALIAS)}' AND schema_name = '_gis'`,
  );
  if (gisRows.length === 0) {
    await query(`DETACH ${ident(OPEN_ALIAS)}`);
    await attach.run({ path: p });
    return "attached";
  }

  try {
    await restoreProject(OPEN_ALIAS, opts.force ?? false);
  } finally {
    await query(`DETACH ${ident(OPEN_ALIAS)}`).catch(() => {});
  }
  return "project";
}

async function restoreProject(alias: string, force: boolean): Promise<void> {
  const projectRows = await query(`SELECT * FROM ${g(alias, "project")}`);
  const meta = projectRows[0];
  if (!meta) throw new Error("Project file has a _gis schema but no project metadata — it may be corrupt.");
  const version = Number(meta.schema_version);
  if (version !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `This project was saved with a ${version > PROJECT_SCHEMA_VERSION ? "newer" : "different"} ` +
        `format (schema_version ${version}, this build supports ${PROJECT_SCHEMA_VERSION}). ` +
        `Open it with a matching build of duckdb-gis.`,
    );
  }
  if (unsavedChanges.isDirty && !force) throw new UnsavedChangesError();

  const layerRows = await query(`SELECT * FROM ${g(alias, "layers")} ORDER BY z_order DESC`); // bottom-most first
  const styleRows = await query(`SELECT layer_id AS id, style FROM ${g(alias, "style")}`);
  const styles = new Map<string, LayerStyle>();
  for (const r of styleRows) {
    try {
      styles.set(str(r.id), JSON.parse(str(r.style)) as LayerStyle);
    } catch {
      // Malformed style JSON — leave that layer on its freshly-assigned default.
    }
  }

  // Everything below here mutates state, so it only starts once the file has
  // passed the checks above.
  if (editing.isEditing()) await editing.finishEdit();
  for (const l of layers.list()) layers.remove(l.id);

  await query(`USE ${ident(alias)}`);
  await query(`DETACH ${ident(WORKING_CATALOG)}`);
  await query(`ATTACH ':memory:' AS ${ident(WORKING_CATALOG)}`);
  await query(`USE ${ident(WORKING_CATALOG)}`);
  await query(`COPY FROM DATABASE ${ident(alias)} TO ${ident(WORKING_CATALOG)}`);
  await query(`DROP SCHEMA ${ident(WORKING_CATALOG)}._gis CASCADE`);

  const attachedDbs = new Set(
    (await query(`SELECT database_name AS db FROM duckdb_databases()`)).map((r) => str(r.db)),
  );

  for (const r of layerRows) {
    const id = str(r.id);
    const name = str(r.name);
    const kind = str(r.source_kind) as SourceKind;
    const visible = Boolean(r.visible);

    if (kind === "table") {
      const db = str(r.source_db);
      const schema = str(r.source_schema);
      const table = str(r.source_table);
      const geomColumn = str(r.source_geom_column);
      const external = Boolean(r.external);
      const sourcePath = nullableStr(r.source_path);
      if (external && sourcePath && !attachedDbs.has(db)) {
        try {
          await query(`ATTACH '${sqlLit(sourcePath)}' AS ${ident(db)} (READ_ONLY)`);
          attachedDbs.add(db);
        } catch {
          // Best-effort: layers.add below will surface a normal load error
          // for this layer if the source truly can't be resolved.
        }
      }
      await layers.add({ db, schema, table, geomColumn });
    } else if (kind === "query") {
      const sql = nullableStr(r.sql);
      if (!sql) continue;
      await layers.addQuery({ id, name, sql });
    } else if (kind === "pmtiles") {
      const theme: OvertureTheme = {
        id: str(r.pmtiles_theme),
        label: str(r.pmtiles_theme_label),
        type: str(r.pmtiles_theme_type),
      };
      await layers.addPmtiles(theme, str(r.pmtiles_release));
    } else {
      continue;
    }

    const style = styles.get(id);
    if (style) layers.setStyle(id, style);
    if (!visible) layers.setVisible(id, false);
  }

  basemap.set(str(meta.basemap_id));
  const map = getMap();
  if (map) {
    map.jumpTo({
      center: [Number(meta.center_lng), Number(meta.center_lat)],
      zoom: Number(meta.zoom),
      bearing: Number(meta.bearing),
      pitch: Number(meta.pitch),
    });
  }
  unsavedChanges.clear(); // the working catalog now matches what was just opened (#67)
}
