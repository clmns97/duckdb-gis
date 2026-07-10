import { query, str } from "./duckdb";

export interface CatalogSchema {
  name: string;
  tables: string[];
}
export interface CatalogDatabase {
  name: string;
  schemas: CatalogSchema[];
}

// Reads the live catalog from native DuckDB. Filters on the *database* internal
// flag only (hides system/temp); the schema `internal` flag is unreliable — an
// empty `main` schema reports internal=true until it holds a user object — so we
// keep all schemas of user databases. A fresh in-memory instance shows `memory › main`.
export async function loadCatalog(): Promise<CatalogDatabase[]> {
  const [schemaRows, tableRows] = await Promise.all([
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
  ]);

  const dbs = new Map<string, Map<string, string[]>>();
  for (const r of schemaRows) {
    const db = str(r.db);
    const schema = str(r.schema);
    if (!dbs.has(db)) dbs.set(db, new Map());
    if (!dbs.get(db)!.has(schema)) dbs.get(db)!.set(schema, []);
  }
  for (const r of tableRows) {
    const db = str(r.db);
    const schema = str(r.schema);
    const schemas = dbs.get(db) ?? dbs.set(db, new Map()).get(db)!;
    const tables = schemas.get(schema) ?? (schemas.set(schema, []).get(schema)!);
    tables.push(str(r.name));
  }

  return [...dbs.entries()].map(([name, schemas]) => ({
    name,
    schemas: [...schemas.entries()].map(([sname, tables]) => ({ name: sname, tables })),
  }));
}
