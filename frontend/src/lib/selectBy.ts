// ---------------------------------------------------------------------------
// Select by expression / Select by location (#113) — QGIS's "Select Features by
// Expression" and "Select by Location". Both run as SQL over the layer's
// features and feed the per-layer selection store, with QGIS's four modes
// (new selection / add / remove / select within the current selection).
// ---------------------------------------------------------------------------

import { selection, fidTaggedRelation, FID, type SelectMode } from "./selection";
import { layers } from "./layers";
import { query } from "./duckdb";
import { inputRelation, utm, type ToolInput } from "./geoprocessing";

/** The `__fid`-tagged features of a layer, every attribute included. */
async function tagged(layerId: string): Promise<string> {
  const base = await layers.attributeSql(layerId);
  if (!base) throw new Error("Features of this layer can't be selected with SQL.");
  return fidTaggedRelation(base);
}

async function applyFids(layerId: string, sql: string, mode: SelectMode): Promise<number> {
  const rows = await query(sql);
  selection.select(layerId, rows.map((r) => ({ key: Number(r[FID]) })), mode);
  return selection.size(layerId);
}

/** Select the features of `layerId` matching a SQL boolean expression over its
 *  columns. Resolves with the layer's selection size afterwards. */
export async function selectByExpression(layerId: string, where: string, mode: SelectMode): Promise<number> {
  if (!where.trim()) throw new Error("Enter an expression, e.g. population > 1000000");
  return applyFids(layerId, `SELECT ${FID} FROM (${await tagged(layerId)}) WHERE (${where})`, mode);
}

export type LocationPredicate = "intersects" | "within" | "contains" | "disjoint" | "dwithin";

const PREDICATE: Record<LocationPredicate, (a: string, b: string, metres: number) => string> = {
  intersects: (a, b) => `ST_Intersects(${a}, ${b})`,
  within: (a, b) => `ST_Within(${a}, ${b})`,
  contains: (a, b) => `ST_Contains(${a}, ${b})`,
  disjoint: (a, b) => `ST_Intersects(${a}, ${b})`, // negated below: touches no feature at all
  // Distance in metres, both measured in the UTM zone of the feature tested.
  dwithin: (a, b, m) =>
    `ST_DWithin(ST_Transform(${a}, 'EPSG:4326', ${utm(a)}, always_xy := true),` +
    ` ST_Transform(${b}, 'EPSG:4326', ${utm(a)}, always_xy := true), ${m})`,
};

/** Select the features of `layerId` that relate to the features of `other`. */
export async function selectByLocation(
  layerId: string,
  predicate: LocationPredicate,
  other: ToolInput,
  mode: SelectMode,
  metres = 0,
): Promise<number> {
  const test = PREDICATE[predicate]("a.geom", "b.geom", metres);
  const exists = `EXISTS (SELECT 1 FROM (${await inputRelation(other)}) b WHERE ${test})`;
  return applyFids(
    layerId,
    `SELECT ${FID} FROM (${await tagged(layerId)}) a WHERE ${predicate === "disjoint" ? "NOT " : ""}${exists}`,
    mode,
  );
}
