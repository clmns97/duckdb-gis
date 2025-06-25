export interface DuckDBUIRunOptions {
  description?: string;
  databaseName?: string;
  schemaName?: string;
  errorsAsJson?: boolean;
  parameters?: unknown[];
  resultChunkLimit?: number;
  resultDatabaseName?: string;
  resultSchemaName?: string;
  resultTableName?: string;
  resultTableChunkLimit?: number;
}
