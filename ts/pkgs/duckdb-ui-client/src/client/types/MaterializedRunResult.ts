import { DuckDBData } from '@duckdb/data-reader';

export interface MaterializedRunResult {
  /**
   * Full result set.
   *
   * Includes column metadata, such as types. Supports duplicate column names without renaming.
   *
   * See the `DuckDBData` interface for details.
   */
  data: DuckDBData;
  startTimeMs: number;
  endTimeMs: number;
}
