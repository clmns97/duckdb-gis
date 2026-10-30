// ---------------------------------------------------------------------------
// Processing tools (T-004, #111).
//
// Layer scope, as in QGIS's Processing Toolbox: a tool reads one or more input
// layers — all features, or only the selected ones — and writes its result to a
// **new table** in the working catalog, added to the map as a layer. It never
// changes its input; changing features in place is the edit toolbar's job
// (feature scope, `lib/editing.ts`).
//
// Each tool is one registry entry: its parameters (which drive the dialog,
// `ProcessingModal`) and a `sql` template — a SELECT over a relation named
// `input` (plus one per extra layer parameter) that projects `geom`. All of it
// runs as native DuckDB spatial SQL.
//
// Input geometry is WGS84 lon/lat (layers reproject on read, #65). Distances
// and areas in metres go through each feature's UTM zone (`inMetres`, `utm`).
// ---------------------------------------------------------------------------

import { selection, fidTaggedRelation, FID } from "./selection";
import { layers, type ActiveLayer } from "./layers";
import { query, ident, sqlLit, str } from "./duckdb";
import { WORKING_CATALOG } from "./workspace";
import { unsavedChanges } from "./unsavedChanges";
import type { MenuItem } from "../components/ContextMenu";

export type ParamValue = string | number;

export type Param =
  | { kind: "number"; key: string; label: string; default: number; unit?: string; min?: number }
  | { kind: "field"; key: string; label: string; optional?: boolean }
  | {
      kind: "choice";
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      default: string;
    }
  | { kind: "text"; key: string; label: string; default: string; pattern?: RegExp; hint?: string }
  /** A further input layer, readable in `sql` as a relation named `key`. */
  | { kind: "layer"; key: string; label: string };

export interface GeoTool {
  id: string;
  label: string;
  group: string;
  /** One sentence for the dialog. */
  description: string;
  params: Param[];
  /** The result: a SELECT over `input` (and each layer param) projecting `geom`. */
  sql: (p: Record<string, ParamValue>) => string;
}

// --- SQL helpers -----------------------------------------------------------

/** The UTM zone (as an `'EPSG:326nn'` / `'EPSG:327nn'` expression) of a
 *  geometry's centroid — a metric CRS that is accurate near the feature. */
export const utm = (g: string): string =>
  `'EPSG:' || (CASE WHEN ST_Y(ST_Centroid(${g})) >= 0 THEN 32600 ELSE 32700 END` +
  ` + LEAST(60, CAST(floor((ST_X(ST_Centroid(${g})) + 180) / 6) AS INTEGER) + 1))`;

const toUtm = (g: string): string => `ST_Transform(${g}, 'EPSG:4326', ${utm(g)}, always_xy := true)`;

/** Apply `f` to `g` in metres: into the feature's UTM zone and back. */
const inMetres = (g: string, f: (m: string) => string): string =>
  `ST_Transform(${f(toUtm(g))}, ${utm(g)}, 'EPSG:4326', always_xy := true)`;

const num = (v: ParamValue): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${v}`);
  return n;
};

/** `scope` parameter shared by the hull / bounding-box tools. */
const SCOPE: Param = {
  kind: "choice",
  key: "scope",
  label: "Create",
  options: [
    { value: "each", label: "One per feature" },
    { value: "all", label: "One for all features" },
  ],
  default: "each",
};
const perScope = (p: Record<string, ParamValue>, f: (g: string) => string): string =>
  p.scope === "all"
    ? `SELECT count(*) AS feature_count, ${f("ST_Collect(list(geom))")} AS geom FROM input`
    : `SELECT * REPLACE (${f("geom")} AS geom) FROM input`;

// --- Registry --------------------------------------------------------------

const GEOMETRY = "Vector geometry";

export const TOOLS: GeoTool[] = [
  {
    id: "buffer",
    label: "Buffer",
    group: GEOMETRY,
    description: "Areas within a distance of each feature.",
    params: [{ kind: "number", key: "distance", label: "Distance", default: 100, unit: "m" }],
    sql: (p) =>
      `SELECT * REPLACE (${inMetres("geom", (g) => `ST_Buffer(${g}, ${num(p.distance)})`)} AS geom) FROM input`,
  },
  {
    id: "centroids",
    label: "Centroids",
    group: GEOMETRY,
    description: "A point for each feature.",
    params: [
      {
        kind: "choice",
        key: "method",
        label: "Point",
        options: [
          { value: "centroid", label: "Centroid" },
          { value: "surface", label: "Point on surface (always inside)" },
        ],
        default: "centroid",
      },
    ],
    sql: (p) =>
      `SELECT * REPLACE (${p.method === "surface" ? "ST_PointOnSurface" : "ST_Centroid"}(geom) AS geom) FROM input`,
  },
  {
    id: "convex_hull",
    label: "Convex hull",
    group: GEOMETRY,
    description: "The smallest convex polygon around the features.",
    params: [SCOPE],
    sql: (p) => perScope(p, (g) => `ST_ConvexHull(${g})`),
  },
  {
    id: "concave_hull",
    label: "Concave hull",
    group: GEOMETRY,
    description: "A polygon that hugs all features more tightly than the convex hull.",
    params: [{ kind: "number", key: "ratio", label: "Tightness (0 tight – 1 convex)", default: 0.3, min: 0 }],
    sql: (p) =>
      `SELECT count(*) AS feature_count, ST_ConcaveHull(ST_Collect(list(geom)), ${num(p.ratio)}, false) AS geom FROM input`,
  },
  {
    id: "bounding_box",
    label: "Bounding box",
    group: GEOMETRY,
    description: "The rectangle around the features.",
    params: [SCOPE],
    sql: (p) => perScope(p, (g) => `ST_Envelope(${g})`),
  },
  {
    id: "simplify",
    label: "Simplify",
    group: GEOMETRY,
    description: "Fewer vertices, keeping the shape within a tolerance.",
    params: [{ kind: "number", key: "tolerance", label: "Tolerance", default: 10, unit: "m", min: 0 }],
    sql: (p) =>
      `SELECT * REPLACE (${inMetres("geom", (g) => `ST_SimplifyPreserveTopology(${g}, ${num(p.tolerance)})`)} AS geom) FROM input`,
  },
  {
    id: "dissolve",
    label: "Dissolve",
    group: GEOMETRY,
    description: "Merge features into one — or one per value of a field.",
    params: [{ kind: "field", key: "field", label: "Dissolve by field", optional: true }],
    sql: (p) =>
      p.field
        ? `SELECT ${ident(String(p.field))}, count(*) AS feature_count, ST_Union_Agg(geom) AS geom FROM input GROUP BY 1`
        : `SELECT count(*) AS feature_count, ST_Union_Agg(geom) AS geom FROM input`,
  },
  {
    id: "explode",
    label: "Multipart to single parts",
    group: GEOMETRY,
    description: "One feature per part of each multi-part geometry.",
    params: [],
    sql: () => `SELECT * EXCLUDE (geom), unnest(ST_Dump(geom)).geom AS geom FROM input`,
  },
  {
    id: "fix",
    label: "Fix geometries",
    group: GEOMETRY,
    description: "Repair invalid geometries (self-intersections, bad rings).",
    params: [],
    sql: () => `SELECT * REPLACE (ST_MakeValid(geom) AS geom) FROM input`,
  },
  {
    id: "geometry_attributes",
    label: "Add geometry attributes",
    group: GEOMETRY,
    description: "Add area, perimeter and length columns, in metres.",
    params: [],
    sql: () =>
      `SELECT *, ST_Area(${toUtm("geom")}) AS area_m2, ST_Perimeter(${toUtm("geom")}) AS perimeter_m,` +
      ` ST_Length(${toUtm("geom")}) AS length_m FROM input`,
  },
  {
    id: "reproject",
    label: "Reproject",
    group: GEOMETRY,
    description: "Transform the geometry to another coordinate reference system.",
    params: [
      {
        kind: "text",
        key: "crs",
        label: "Target CRS",
        default: "EPSG:3857",
        pattern: /^[A-Za-z]+:[A-Za-z0-9_.]+$/,
        hint: "An authority code, e.g. EPSG:25832",
      },
    ],
    sql: (p) => {
      const crs = sqlLit(String(p.crs));
      return `SELECT * REPLACE (ST_Transform(geom, 'EPSG:4326', '${crs}', always_xy := true)::GEOMETRY('${crs}') AS geom) FROM input`;
    },
  },
  {
    id: "voronoi",
    label: "Voronoi polygons",
    group: GEOMETRY,
    description: "A cell around each point: the area closer to it than to any other.",
    params: [],
    // The diagram reaches far beyond the points; clip it to their extent plus
    // a margin of a tenth of its size.
    sql: () =>
      `SELECT ST_Intersection(cell, frame) AS geom FROM (
         SELECT unnest(ST_Dump(ST_VoronoiDiagram(g))).geom AS cell,
                ST_MakeEnvelope(ST_XMin(g) - pad, ST_YMin(g) - pad, ST_XMax(g) + pad, ST_YMax(g) + pad) AS frame
         FROM (SELECT g, greatest(ST_XMax(g) - ST_XMin(g), ST_YMax(g) - ST_YMin(g)) / 10 AS pad
               FROM (SELECT ST_Collect(list(geom)) AS g FROM input)))`,
  },
];

const OVERLAY = "Vector overlay";
const OVERLAY_LAYER: Param = { kind: "layer", key: "overlay", label: "Overlay layer" };

/** The overlay's attributes, prefixed so they can't clash with the input's. */
const overlayCols = (b: string): string => `COLUMNS(${b}.* EXCLUDE (geom)) AS 'overlay_\\0'`;

/** `g` minus every feature of `rel` that touches it. */
const minus = (g: string, rel: string): string =>
  `ST_Difference(${g}, coalesce((SELECT ST_Union_Agg(o.geom) FROM ${rel} o WHERE ST_Intersects(o.geom, ${g})),` +
  ` ST_GeomFromText('GEOMETRYCOLLECTION EMPTY')))`;

/** Only the parts of `g` of `like`'s geometry family (an overlay of two
 *  polygons can also touch in lines or points). */
const sameFamily = (g: string, like: string): string =>
  `ST_CollectionExtract(${g}, ST_Dimension(${like}) + 1)`;

const nonEmpty = (sql: string): string => `SELECT * FROM (${sql}) WHERE NOT ST_IsEmpty(geom)`;

const intersections = `SELECT a.* EXCLUDE (geom), ${overlayCols("b")},
       ST_CollectionExtract(ST_Intersection(a.geom, b.geom), least(ST_Dimension(a.geom), ST_Dimension(b.geom)) + 1) AS geom
  FROM input a JOIN overlay b ON ST_Intersects(a.geom, b.geom)`;

const PREDICATES: Record<string, string> = {
  intersects: "ST_Intersects(a.geom, b.geom)",
  within: "ST_Within(a.geom, b.geom)",
  contains: "ST_Contains(a.geom, b.geom)",
};

TOOLS.push(
  {
    id: "clip",
    label: "Clip",
    group: OVERLAY,
    description: "The parts of the input features inside the overlay layer's features.",
    params: [OVERLAY_LAYER],
    sql: () =>
      nonEmpty(
        `SELECT a.* REPLACE (${sameFamily("ST_Intersection(a.geom, o.g)", "a.geom")} AS geom)
         FROM input a, (SELECT ST_Union_Agg(geom) AS g FROM overlay) o WHERE ST_Intersects(a.geom, o.g)`,
      ),
  },
  {
    id: "difference",
    label: "Difference",
    group: OVERLAY,
    description: "The parts of the input features outside the overlay layer's features.",
    params: [OVERLAY_LAYER],
    sql: () => nonEmpty(`SELECT a.* REPLACE (${sameFamily(minus("a.geom", "overlay"), "a.geom")} AS geom) FROM input a`),
  },
  {
    id: "intersection",
    label: "Intersection",
    group: OVERLAY,
    description: "Where input and overlay features overlap, with the attributes of both.",
    params: [OVERLAY_LAYER],
    sql: () => nonEmpty(intersections),
  },
  {
    id: "union",
    label: "Union",
    group: OVERLAY,
    description: "Both layers cut at each other's edges: overlaps with both attributes, the rest with one.",
    params: [OVERLAY_LAYER],
    sql: () =>
      nonEmpty(
        `${intersections}
         UNION ALL BY NAME
         SELECT a.* REPLACE (${sameFamily(minus("a.geom", "overlay"), "a.geom")} AS geom) FROM input a
         UNION ALL BY NAME
         SELECT ${overlayCols("b")}, ${sameFamily(minus("b.geom", "input"), "b.geom")} AS geom FROM overlay b`,
      ),
  },
  {
    id: "spatial_join",
    label: "Join attributes by location",
    group: OVERLAY,
    description: "Copy the overlay's attributes onto the input features they match (one row per match).",
    params: [
      { ...OVERLAY_LAYER, label: "Join layer" },
      {
        kind: "choice",
        key: "predicate",
        label: "Where the input feature",
        options: [
          { value: "intersects", label: "intersects" },
          { value: "within", label: "is within" },
          { value: "contains", label: "contains" },
        ],
        default: "intersects",
      },
      {
        kind: "choice",
        key: "keep",
        label: "Input features without a match",
        options: [
          { value: "left", label: "Keep" },
          { value: "inner", label: "Drop" },
        ],
        default: "left",
      },
    ],
    sql: (p) =>
      `SELECT a.*, ${overlayCols("b")} FROM input a ${p.keep === "inner" ? "" : "LEFT "}JOIN overlay b
       ON ${PREDICATES[String(p.predicate)] ?? PREDICATES.intersects}`,
  },
  {
    id: "count_points",
    label: "Count points in polygon",
    group: OVERLAY,
    description: "Add the number of points that fall in each polygon.",
    params: [{ kind: "layer", key: "overlay", label: "Points layer" }],
    sql: () =>
      `SELECT a.*, (SELECT count(*) FROM overlay b WHERE ST_Intersects(a.geom, b.geom)) AS point_count FROM input a`,
  },
  {
    id: "merge_layers",
    label: "Merge vector layers",
    group: OVERLAY,
    description: "All features of both layers in one; columns are matched by name.",
    params: [{ kind: "layer", key: "overlay", label: "Second layer" }],
    sql: () => `SELECT * FROM input UNION ALL BY NAME SELECT * FROM overlay`,
  },
);

// --- Running ---------------------------------------------------------------

/** Layers a tool can read: deck-drawn layers that finished loading. */
export function inputLayers(): ActiveLayer[] {
  return layers.list().filter((l) => l.kind !== "pmtiles" && l.status === "ready");
}

/** One input: a layer, and whether to read only its selected features. */
export interface ToolInput {
  layerId: string;
  selectedOnly: boolean;
}

/** An input layer's features (all, or the selected ones) with attributes. */
export async function inputRelation({ layerId, selectedOnly }: ToolInput): Promise<string> {
  const base = await layers.attributeSql(layerId);
  if (!base) throw new Error("This layer can't be used as a tool input.");
  const fids = selectedOnly ? selection.keys(layerId) : [];
  if (selectedOnly && fids.length === 0) throw new Error("No features are selected in the input layer.");
  const where = selectedOnly ? ` WHERE ${FID} IN (${fids.map(num).join(", ")})` : "";
  return `SELECT * EXCLUDE (${FID}) FROM (${fidTaggedRelation(base)})${where}`;
}

/** The input layer's attribute columns (for field parameters). */
export async function inputFields(layerId: string): Promise<string[]> {
  const base = await layers.attributeSql(layerId);
  if (!base) return [];
  const rows = await query(`DESCRIBE (${base})`);
  return rows.map((r) => str(r.column_name)).filter((c) => c !== "geom");
}

/** A table name in the working catalog that isn't taken yet, from `base`. */
export async function freeTableName(base: string): Promise<string> {
  const clean = base.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1") || "result";
  const rows = await query(
    `SELECT table_name AS t FROM duckdb_tables() WHERE database_name = '${sqlLit(WORKING_CATALOG)}' AND schema_name = 'main'`,
  );
  const taken = new Set(rows.map((r) => str(r.t).toLowerCase()));
  let name = clean;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${clean}_${i}`;
  return name;
}

/**
 * Run a tool: write its result to `main.<output>` in the working catalog and
 * add that table as a layer. `inputs` maps `input` and every layer parameter's
 * key to the layer it reads.
 */
export async function runTool(
  tool: GeoTool,
  inputs: Record<string, ToolInput>,
  values: Record<string, ParamValue>,
  output: string,
): Promise<void> {
  const ctes = await Promise.all(
    Object.entries(inputs).map(async ([key, input]) => `${ident(key)} AS (${await inputRelation(input)})`),
  );
  await query(
    `CREATE TABLE ${ident(WORKING_CATALOG)}.main.${ident(output)} AS WITH ${ctes.join(", ")} ${tool.sql(values)}`,
  );
  unsavedChanges.markDirty(); // a new working-catalog table (#67)
  await layers.add({ db: WORKING_CATALOG, schema: "main", table: output, geomColumn: "geom" });
}

/** The Processing menu: every tool under its group's heading, then the
 *  selection tools (#113). */
export function processingMenuItems(
  open: (tool: GeoTool) => void,
  openSelectBy: (kind: "expression" | "location") => void,
): MenuItem[] {
  const items: MenuItem[] = [];
  for (const tool of TOOLS) {
    if (items.length === 0 || tool.group !== TOOLS[TOOLS.indexOf(tool) - 1].group) {
      items.push({ label: tool.group, header: true });
    }
    items.push({ label: `${tool.label}…`, onSelect: () => open(tool) });
  }
  items.push(
    { label: "Selection", header: true },
    { label: "Select by expression…", onSelect: () => openSelectBy("expression") },
    { label: "Select by location…", onSelect: () => openSelectBy("location") },
  );
  return items;
}
