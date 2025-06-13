import { DuckDBData } from '@duckdb/data-reader';
import { DuckDBType } from '@duckdb/data-types';
import { DuckDBValue } from '@duckdb/data-values';
import { duckDBTypeFromTypeIdAndInfo } from '../../conversion/functions/duckDBTypeFromTypeIdAndInfo.js';
import { duckDBValueFromVector } from '../../conversion/functions/duckDBValueFromVector.js';
import { ColumnNamesAndTypes } from '../../serialization/types/ColumnNamesAndTypes.js';
import { DataChunk } from '../../serialization/types/DataChunk.js';

export class DuckDBDataChunk extends DuckDBData {
  constructor(
    private columnNamesAndTypes: ColumnNamesAndTypes,
    private chunk: DataChunk,
  ) {
    super();
  }

  get columnCount() {
    return this.columnNamesAndTypes.names.length;
  }

  get rowCount() {
    return this.chunk.rowCount;
  }

  columnName(columnIndex: number): string {
    return this.columnNamesAndTypes.names[columnIndex];
  }

  columnType(columnIndex: number): DuckDBType {
    return duckDBTypeFromTypeIdAndInfo(
      this.columnNamesAndTypes.types[columnIndex],
    );
  }

  value(columnIndex: number, rowIndex: number): DuckDBValue {
    return duckDBValueFromVector(
      this.columnNamesAndTypes.types[columnIndex],
      this.chunk.vectors[columnIndex],
      rowIndex,
    );
  }
}
