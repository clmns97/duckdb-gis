import { DuckDBType } from '@duckdb/data-types';
import { DuckDBValue } from '@duckdb/data-values';
import { DuckDBRow } from './DuckDBRow.js';

/**
 * A two-dimensional table of data along with column metadata.
 *
 * May represent either a partial or full result set, or a batch of rows read from a result stream.
 * */
export abstract class DuckDBData {
  /**
   * Number of columns.
   *
   * May be zero until the first part of the result is read. Will not change after the initial read.
   */
  abstract get columnCount(): number;

  /**
   * Current number of rows.
   *
   * For a partial result set, this may change as more rows are read.
   * For a full result, or a batch, this will not change.
   */
  abstract get rowCount(): number;

  /**
   * Returns the name of column at the given index (starting at zero).
   *
   * Note that duplicate column names are possible.
   */
  abstract columnName(columnIndex: number): string;

  /**
   * Returns the type of the column at the given index (starting at zero).
   */
  abstract columnType(columnIndex: number): DuckDBType;

  /**
   * Returns the value for the given column and row. Both are zero-indexed.
   */
  abstract value(columnIndex: number, rowIndex: number): DuckDBValue;

  /**
   * Returns the single value, assuming exactly one column and row. Throws otherwise.
   */
  singleValue(): DuckDBValue {
    const { columnCount, rowCount } = this;
    if (columnCount === 0) {
      throw Error('no column data');
    }
    if (rowCount === 0) {
      throw Error('no rows');
    }
    if (columnCount > 1) {
      throw Error('more than one column');
    }
    if (rowCount > 1) {
      throw Error('more than one row');
    }
    return this.value(0, 0);
  }

  /**
   * Returns the column names as an array.
   */
  columnNames(): readonly string[] {
    const { columnCount } = this;
    const outputColumnNames: string[] = [];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      outputColumnNames.push(this.columnName(columnIndex));
    }
    return outputColumnNames;
  }

  /**
   * Returns the column names as an array, deduplicated following DuckDB's "Auto-Increment Duplicate Column Names"
   * behavior.
   */
  deduplicatedColumnNames(): readonly string[] {
    const { columnCount } = this;
    const outputColumnNames: string[] = [];
    const columnNameCount: { [columnName: string]: number } = {};
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const inputColumnName = this.columnName(columnIndex);
      const nameCount = (columnNameCount[inputColumnName] || 0) + 1;
      columnNameCount[inputColumnName] = nameCount;
      if (nameCount > 1) {
        outputColumnNames.push(`${inputColumnName}:${nameCount - 1}`);
      } else {
        outputColumnNames.push(inputColumnName);
      }
    }
    return outputColumnNames;
  }

  /**
   * Returns the data as an array of row objects, keyed by column names.
   *
   * The column names are deduplicated following DuckDB's "Auto-Increment Duplicate Column Names" behavior.
   */
  toRows(): readonly DuckDBRow[] {
    const { rowCount, columnCount } = this;
    const outputColumnNames = this.deduplicatedColumnNames();
    const outputRows: DuckDBRow[] = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row: { [columnName: string]: DuckDBValue } = {};
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        row[outputColumnNames[columnIndex]] = this.value(columnIndex, rowIndex);
      }
      outputRows.push(row);
    }
    return outputRows;
  }
}
