import { DuckDBUIClient } from "@duckdb/ui-client";

// Transport seam: run spatial SQL against native, in-process DuckDB via the
// extension's SQL-over-HTTP API, reusing the DuckDB team's own client package
// (which decodes the binary result format). In dev, requests go to the Vite
// proxy, which forwards them to the running `start_gis` server.
const connection = DuckDBUIClient.singleton.connection;

// Row type is inferred from the client (@duckdb/data-reader's DuckDBRow, an
// index of DuckDBValue) rather than imported by name — that package is only a
// transitive dep here, so a direct import wouldn't resolve for tsc.
type Row = Awaited<ReturnType<typeof connection.run>>["data"] extends {
  toRows(): infer R;
}
  ? R
  : never;

/** Run a query and return its rows as objects keyed by column name. */
export async function query(sql: string): Promise<Row> {
  const result = await connection.run(sql);
  return result.data.toRows();
}

/** Coerce a DuckDBValue to a plain string for display. */
export function str(value: unknown): string {
  return value == null ? "" : String(value);
}

/** Extract a readable message from an unknown thrown value. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
