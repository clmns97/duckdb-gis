import { DuckDBType } from '@duckdb/data-types';
import { DuckDBValue } from '@duckdb/data-values';
import { DuckDBData } from './DuckDBData.js';

export class MemoryDuckDBData extends DuckDBData {
  constructor(
    private columns: { name: string; type: DuckDBType }[],
    private values: DuckDBValue[][],
  ) {
    super();
  }

  get columnCount() {
    return this.columns.length;
  }

  get rowCount() {
    return this.values.length > 0 ? this.values[0].length : 0;
  }

  columnName(columnIndex: number): string {
    return this.columns[columnIndex].name;
  }

  columnType(columnIndex: number): DuckDBType {
    return this.columns[columnIndex].type;
  }

  value(columnIndex: number, rowIndex: number): DuckDBValue {
    return this.values[columnIndex][rowIndex];
  }
}
