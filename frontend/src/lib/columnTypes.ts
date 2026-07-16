// Map DuckDB `data_type` strings to a small "kind" used for the type glyph shown
// in grid headers / schema lists (mirrors the DuckDB UI's 123 / # / T / △ set)
// and to decide numeric right-alignment. Types can be parameterised
// (`DECIMAL(18,3)`), arrays (`INTEGER[]`), or nested (`STRUCT(...)`); we match on
// the leading identifier token, which is enough to classify.

export type TypeKind = "int" | "float" | "text" | "bool" | "temporal" | "geometry" | "other";

const INT = new Set([
  "TINYINT", "SMALLINT", "INTEGER", "INT", "INT2", "INT4", "INT8", "BIGINT", "HUGEINT",
  "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT", "LONG",
]);
const FLOAT = new Set(["DECIMAL", "NUMERIC", "REAL", "FLOAT", "FLOAT4", "FLOAT8", "DOUBLE"]);
const TEXT = new Set(["VARCHAR", "CHAR", "BPCHAR", "TEXT", "STRING", "UUID", "JSON", "ENUM"]);
const TEMPORAL = new Set([
  "DATE", "TIME", "TIMETZ", "TIMESTAMP", "TIMESTAMPTZ", "DATETIME", "INTERVAL",
]);
const GEOMETRY = new Set(["GEOMETRY", "GEOGRAPHY", "POINT_2D", "BOX_2D", "WKB_BLOB"]);

/** Classify a DuckDB type string into a display kind. */
export function typeKind(dataType: string | null | undefined): TypeKind {
  if (!dataType) return "other";
  // leading identifier: strip params/array suffixes → "DECIMAL(18,3)[]" -> "DECIMAL"
  const head = dataType.trim().toUpperCase().match(/^[A-Z0-9_]+/)?.[0] ?? "";
  if (INT.has(head)) return "int";
  if (FLOAT.has(head)) return "float";
  if (TEXT.has(head)) return "text";
  if (head === "BOOLEAN" || head === "BOOL") return "bool";
  if (TEMPORAL.has(head)) return "temporal";
  if (GEOMETRY.has(head)) return "geometry";
  return "other";
}

/** Numeric kinds are right-aligned in the grid, like the DuckDB results table. */
export function isNumeric(kind: TypeKind): boolean {
  return kind === "int" || kind === "float";
}
