export interface DuckDBUIRunOptions {
  description?: string;
  databaseName?: string;
  schemaName?: string;
  errorsAsJson?: boolean;
  parameters?: unknown[];
  resultRowLimit?: number;
  resultDatabaseName?: string;
  resultSchemaName?: string;
  resultTableName?: string;
  resultTableRowLimit?: number;
}
