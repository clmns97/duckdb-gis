import { query, str } from "./duckdb";

export interface CatalogTable {
  name: string;
  /**
   * Geometry columns on this table, detected by type (T-001). Empty for a
   * non-spatial table; a spatial table exposes one addable layer per column
   * (a table may carry several GEOMETRY columns).
   */
  geomColumns: string[];
}
export interface CatalogSchema {
  name: string;
  tables: CatalogTable[];
}
export interface CatalogDatabase {
  name: string;
  schemas: CatalogSchema[];
}

// Reads the live catalog from native DuckDB. Filters on the *database* internal
// flag only (hides system/temp); the schema `internal` flag is unreliable — an
// empty `main` schema reports internal=true until it holds a user object — so we
// keep all schemas of user databases. A fresh in-memory instance shows `memory › main`.
//
// Geometry layers are detected by *column type* (T-001): a table is a candidate
// map layer iff it has a column of `data_type = 'GEOMETRY'`. This catches
// geometry columns of any name, never false-positives on a lookalike name, and
// spans every attached database — strictly better than name-matching.
export async function loadCatalog(): Promise<CatalogDatabase[]> {
  const [schemaRows, tableRows, geomRows] = await Promise.all([
    query(`
      SELECT d.database_name AS db, s.schema_name AS schema
      FROM duckdb_databases() d
      JOIN duckdb_schemas() s ON s.database_name = d.database_name
      WHERE NOT d.internal
      ORDER BY 1, 2
    `),
    query(`
      SELECT database_name AS db, schema_name AS schema, table_name AS name
      FROM duckdb_tables()
      WHERE NOT internal
      ORDER BY 1, 2, 3
    `),
    query(`
      SELECT c.database_name AS db, c.schema_name AS schema,
             c.table_name AS name, c.column_name AS geom_column
      FROM duckdb_columns() c
      JOIN duckdb_databases() d ON d.database_name = c.database_name
      WHERE c.data_type = 'GEOMETRY' AND NOT d.internal
      ORDER BY 1, 2, 3, 4
    `),
  ]);

  const dbs = new Map<string, Map<string, Map<string, CatalogTable>>>();
  const ensureSchema = (db: string, schema: string): Map<string, CatalogTable> => {
    if (!dbs.has(db)) dbs.set(db, new Map());
    const schemas = dbs.get(db)!;
    if (!schemas.has(schema)) schemas.set(schema, new Map());
    return schemas.get(schema)!;
  };

  for (const r of schemaRows) {
    ensureSchema(str(r.db), str(r.schema));
  }
  for (const r of tableRows) {
    const tables = ensureSchema(str(r.db), str(r.schema));
    const name = str(r.name);
    if (!tables.has(name)) tables.set(name, { name, geomColumns: [] });
  }
  // Attach geometry columns to their table. `duckdb_columns()` also covers
  // views; we only surface tables, so a geometry column with no matching table
  // entry is simply skipped.
  for (const r of geomRows) {
    const table = dbs.get(str(r.db))?.get(str(r.schema))?.get(str(r.name));
    table?.geomColumns.push(str(r.geom_column));
  }

  return [...dbs.entries()].map(([name, schemas]) => ({
    name,
    schemas: [...schemas.entries()].map(([sname, tables]) => ({
      name: sname,
      tables: [...tables.values()],
    })),
  }));
}
