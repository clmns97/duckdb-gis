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

import { query, str, sqlLit, errMsg } from "./duckdb";
import { ident, layers, type ActiveLayer, type LayerStyle } from "./layers";
import type { OvertureTheme } from "./overture";
import { WORKING_CATALOG } from "./workspace";
import { basemap } from "./basemaps";
import { getMap } from "./mapBus";
import { editing } from "./editing";
import { attach } from "./attach";

export const PROJECT_SCHEMA_VERSION = 1;

// Fixed, reserved aliases for the file being saved/opened — never left
// attached past the end of the operation (always detached in a `finally`), so
// collisions with a user's own attach are not a real concern in practice.
const SAVE_ALIAS = "__gis_project_save";
const OPEN_ALIAS = "__gis_project_open";

type SourceKind = "table" | "query" | "pmtiles";

/** Quote a value for SQL, or `NULL` when absent. */
function lit(v: string | null | undefined): string {
  return v == null ? "NULL" : `'${sqlLit(v)}'`;
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
  const views = await query(
    `SELECT view_name AS n FROM duckdb_views() WHERE database_name = '${sqlLit(alias)}' AND schema_name = 'main' AND NOT internal`,
  );
  for (const r of views) await query(`DROP VIEW ${ident(alias)}.main.${ident(str(r.n))}`);

  const tables = await query(
    `SELECT table_name AS n FROM duckdb_tables() WHERE database_name = '${sqlLit(alias)}' AND schema_name = 'main' AND NOT internal`,
  );
  for (const r of tables) await query(`DROP TABLE ${ident(alias)}.main.${ident(str(r.n))}`);

  const seqs = await query(
    `SELECT sequence_name AS n FROM duckdb_sequences() WHERE database_name = '${sqlLit(alias)}' AND schema_name = 'main'`,
  );
  for (const r of seqs) await query(`DROP SEQUENCE ${ident(alias)}.main.${ident(str(r.n))}`);

  const schemas = await query(
    `SELECT schema_name AS n FROM duckdb_schemas() WHERE database_name = '${sqlLit(alias)}' AND NOT internal AND schema_name <> 'main'`,
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
    const row = layerToRow(layer, data.dbPaths);
    if (!row) continue; // nothing persistable (e.g. a query layer that never resolved its SQL)

    await query(`INSERT INTO ${g(alias, "layers")} VALUES (
      '${sqlLit(layer.id)}', '${sqlLit(layer.name)}', '${row.sourceKind}', ${i}, ${layer.visible},
      ${lit(row.sourceDb)}, ${lit(row.sourceSchema)}, ${lit(row.sourceTable)}, ${lit(row.sourceGeomColumn)},
      ${row.external}, ${lit(row.sourcePath)},
      ${lit(row.sql)},
      ${lit(row.pmTheme)}, ${lit(row.pmThemeLabel)}, ${lit(row.pmThemeType)}, ${lit(row.pmRelease)}
    )`);

    if (layer.style) {
      await query(
        `INSERT INTO ${g(alias, "style")} VALUES ('${sqlLit(layer.id)}', '${sqlLit(JSON.stringify(layer.style))}'::JSON)`,
      );
    }
  }
}

interface LayerRow {
  sourceKind: SourceKind;
  sourceDb: string | null;
  sourceSchema: string | null;
  sourceTable: string | null;
  sourceGeomColumn: string | null;
  external: boolean;
  sourcePath: string | null;
  sql: string | null;
  pmTheme: string | null;
  pmThemeLabel: string | null;
  pmThemeType: string | null;
  pmRelease: string | null;
}

function layerToRow(layer: ActiveLayer, dbPaths: Map<string, string>): LayerRow | null {
  const empty: Omit<LayerRow, "sourceKind"> = {
    sourceDb: null,
    sourceSchema: null,
    sourceTable: null,
    sourceGeomColumn: null,
    external: false,
    sourcePath: null,
    sql: null,
    pmTheme: null,
    pmThemeLabel: null,
    pmThemeType: null,
    pmRelease: null,
  };

  if (layer.kind === "table" && layer.source) {
    const external = layer.source.db !== WORKING_CATALOG;
    return {
      ...empty,
      sourceKind: "table",
      sourceDb: layer.source.db,
      sourceSchema: layer.source.schema,
      sourceTable: layer.source.table,
      sourceGeomColumn: layer.source.geomColumn,
      external,
      sourcePath: external ? (dbPaths.get(layer.source.db) ?? null) : null,
    };
  }
  if (layer.kind === "query") {
    if (!layer.sql) return null;
    return { ...empty, sourceKind: "query", sql: layer.sql };
  }
  if (layer.kind === "pmtiles" && layer.pmtiles) {
    return {
      ...empty,
      sourceKind: "pmtiles",
      pmTheme: layer.pmtiles.theme.id,
      pmThemeLabel: layer.pmtiles.theme.label,
      pmThemeType: layer.pmtiles.theme.type,
      pmRelease: layer.pmtiles.release,
    };
  }
  return null;
}

/**
 * Open a `.duckdb` file. If it carries our `_gis` schema, restore it as a
 * project (replacing the current working session); otherwise fall back to a
 * plain read-only attach (#8) — `_gis`'s presence is the only thing that
 * distinguishes the two, per #33/#8.
 */
export async function openProject(path: string): Promise<"project" | "attached"> {
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
    await restoreProject(OPEN_ALIAS);
  } finally {
    await query(`DETACH ${ident(OPEN_ALIAS)}`).catch(() => {});
  }
  return "project";
}

async function restoreProject(alias: string): Promise<void> {
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
}
