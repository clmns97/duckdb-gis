import { DataType, tableFromIPC, type Field, type Table } from "apache-arrow";

// Transport seam: run SQL against native, in-process DuckDB via the
// extension's SQL-over-HTTP API. `POST /ddb/run` runs every statement in the
// body and answers with the last one's result as an Arrow IPC stream, or with
// HTTP 400 and DuckDB's error message (see src/http_server.cpp). In dev,
// requests go to the Vite proxy, which forwards them to the running
// `start_gis_server`.
//
// All requests share one DuckDB connection on the server, so session state
// (SET, LOAD, an open transaction) carries over between calls.

/** A result row: column name → plain JS value (see `plainValue`). */
export type Row = Record<string, unknown>;

/** Run SQL and return the last statement's result as an Arrow table. */
export async function queryArrow(sql: string): Promise<{ table: Table; bytes: number }> {
  const res = await fetch("/ddb/run", { method: "POST", body: sql });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `query failed (HTTP ${res.status})`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return { table: tableFromIPC(buffer), bytes: buffer.byteLength };
}

/** Run SQL and return the last statement's rows as objects keyed by column name. */
export async function query(sql: string): Promise<Row[]> {
  const { table } = await queryArrow(sql);
  const fields = table.schema.fields;
  const columns = fields.map((_, i) => table.getChildAt(i));
  const rows: Row[] = [];
  for (let r = 0; r < table.numRows; r++) {
    const row: Row = {};
    fields.forEach((field, c) => {
      row[field.name] = plainValue(columns[c]?.get(r), field.type);
    });
    rows.push(row);
  }
  return rows;
}

// Arrow values as plain JS: numbers, bigint (BIGINT/HUGEINT), strings,
// booleans and Uint8Array (BLOB, and GEOMETRY as WKB) pass through; DECIMAL
// becomes its exact decimal string, dates/timestamps ISO-8601 strings, and
// LIST/STRUCT/MAP plain arrays/objects. For display formatting identical to
// DuckDB's, cast to VARCHAR in SQL instead.
function plainValue(value: unknown, type: DataType): unknown {
  if (value == null) return null;
  if (DataType.isDecimal(type)) return decimalString(value as Uint32Array, type.scale);
  if (DataType.isTimestamp(type) || DataType.isDate(type)) {
    return new Date(Number(value)).toISOString();
  }
  if (DataType.isList(type) || DataType.isFixedSizeList(type)) {
    const child = (type.children[0] as Field).type;
    return Array.from(value as Iterable<unknown>, (v) => plainValue(v, child));
  }
  if (DataType.isStruct(type)) {
    const out: Row = {};
    const struct = value as Record<string, unknown>;
    for (const f of type.children) out[f.name] = plainValue(struct[f.name], f.type);
    return out;
  }
  if (DataType.isMap(type)) {
    return (value as { toJSON(): unknown }).toJSON();
  }
  return value;
}

// An Arrow decimal arrives as its unscaled two's-complement integer in 32-bit
// little-endian words; place the decimal point `scale` digits from the right.
function decimalString(words: Uint32Array, scale: number): string {
  let n = 0n;
  for (let i = words.length - 1; i >= 0; i--) n = (n << 32n) | BigInt(words[i]);
  const bits = BigInt(words.length * 32);
  if (n >> (bits - 1n)) n -= 1n << bits; // negative
  const negative = n < 0n;
  let digits = (negative ? -n : n).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, "0");
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  }
  return negative ? `-${digits}` : digits;
}

/** Coerce a query value to a plain string for display. */
export function str(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && !(value instanceof Uint8Array)) return JSON.stringify(value, jsonBigInt);
  return String(value);
}

const jsonBigInt = (_key: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

/** Extract a readable message from an unknown thrown value. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Escape a value for use inside a single-quoted SQL string literal. */
export function sqlLit(v: string): string {
  return v.replace(/'/g, "''");
}
