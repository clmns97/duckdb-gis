import { DuckDBType } from '@duckdb/data-types';
import { DuckDBValue } from '@duckdb/data-values';
import { DuckDBData } from './DuckDBData.js';

export class ColumnFilteredDuckDBData extends DuckDBData {
  private readonly inputColumnIndexForOutputColumnIndex: readonly number[];

  constructor(
    private data: DuckDBData,
    columnVisibility: readonly boolean[],
  ) {
    super();

    const inputColumnIndexForOutputColumnIndex: number[] = [];
    const inputColumnCount = data.columnCount;
    let inputIndex = 0;
    while (inputIndex < inputColumnCount) {
      while (inputIndex < inputColumnCount && !columnVisibility[inputIndex]) {
        inputIndex++;
      }
      if (inputIndex < inputColumnCount) {
        inputColumnIndexForOutputColumnIndex.push(inputIndex++);
      }
    }
    this.inputColumnIndexForOutputColumnIndex =
      inputColumnIndexForOutputColumnIndex;
  }

  get columnCount() {
    return this.inputColumnIndexForOutputColumnIndex.length;
  }

  get rowCount() {
    return this.data.rowCount;
  }

  columnName(columnIndex: number): string {
    return this.data.columnName(
      this.inputColumnIndexForOutputColumnIndex[columnIndex],
    );
  }

  columnType(columnIndex: number): DuckDBType {
    return this.data.columnType(
      this.inputColumnIndexForOutputColumnIndex[columnIndex],
    );
  }

  value(columnIndex: number, rowIndex: number): DuckDBValue {
    return this.data.value(
      this.inputColumnIndexForOutputColumnIndex[columnIndex],
      rowIndex,
    );
  }
}
