import { DuckDBValue } from '@duckdb/data-values';

export interface DuckDBRow {
  readonly [columnName: string]: DuckDBValue;
}
