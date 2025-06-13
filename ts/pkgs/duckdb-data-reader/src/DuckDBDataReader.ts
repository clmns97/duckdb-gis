import { DuckDBType } from '@duckdb/data-types';
import { DuckDBValue } from '@duckdb/data-values';
import { AsyncDuckDBDataBatchIterator } from './AsyncDuckDBDataBatchIterator.js';
import { DuckDBData } from './DuckDBData.js';

// Stores information about a run of similarly-sized batches.
interface BatchSizeRun {
  batchCount: number;
  batchSize: number;
  rowCount: number; // Always equal to batchCount * batchSize. Precalculated for efficiency.
}

/**
 * A result set that can be read incrementally.
 *
 * Represents either a partial or full result.
 * For full results, the `done` property will be true.
 * To read more rows into a partial result, use the `readUntil` or `readAll` methods.
 */
export class DuckDBDataReader extends DuckDBData {
  private readonly iterator: AsyncDuckDBDataBatchIterator;

  private iteratorDone: boolean = false;

  private totalRowsRead: number = 0;

  private readonly batches: DuckDBData[] = [];

  // Stores the sizes of the batches using run-length encoding to make lookup efficient.
  // Since batches before the last should be a consistent size, this array is not expected to grow beyond length 2.
  // (One run for the N-1 batches of consistent size, plus one run for the differently-size last batch, if any.)
  private readonly batchSizeRuns: BatchSizeRun[] = [];

  constructor(iterator: AsyncDuckDBDataBatchIterator) {
    super();
    this.iterator = iterator;
  }

  /**
   * Number of columns.
   *
   * Will be zero until the first part of the result is read. Will not change after the initial read.
   */
  public get columnCount(): number {
    if (this.batches.length === 0) {
      return 0;
    }
    return this.batches[0].columnCount;
  }

  /**
   * Current number of rows.
   *
   * For a partial result set, with `done` false, this may change as more rows are read.
   * For a full result, with `done` true, this will not change.
   */
  public get rowCount(): number {
    return this.totalRowsRead;
  }

  /**
   * Returns the name of column at the given index (starting at zero).
   *
   * Note that duplicate column names are possible.
   *
   * Will return an error if no part of the result has been read yet.
   */
  public columnName(columnIndex: number): string {
    if (this.batches.length === 0) {
      throw Error('no column data');
    }
    return this.batches[0].columnName(columnIndex);
  }

  /**
   * Returns the type of the column at the given index (starting at zero).
   *
   * Will return an error if no part of the result has been read yet.
   */
  public columnType(columnIndex: number): DuckDBType {
    if (this.batches.length === 0) {
      throw Error('no column data');
    }
    return this.batches[0].columnType(columnIndex);
  }

  /**
   * Returns the value for the given column and row. Both are zero-indexed.
   *
   * Will return an error if `rowIndex` is not less than the current `rowCount`.
   */
  public value(columnIndex: number, rowIndex: number): DuckDBValue {
    if (this.totalRowsRead === 0) {
      throw Error('no data');
    }
    let batchIndex = 0;
    let currentRowIndex = rowIndex;
    // Find which run of batches our row is in.
    // Since batchSizeRuns shouldn't ever be longer than 2, this should be O(1).
    for (const run of this.batchSizeRuns) {
      if (currentRowIndex < run.rowCount) {
        // The row we're looking for is in this run.
        // Calculate the batch index and the row index in that batch.
        batchIndex += Math.floor(currentRowIndex / run.batchSize);
        const rowIndexInBatch = currentRowIndex % run.batchSize;
        const batch = this.batches[batchIndex];
        return batch.value(columnIndex, rowIndexInBatch);
      }
      // The row we're looking for is not in this run.
      // Update our counts for this run and move to the next one.
      batchIndex += run.batchCount;
      currentRowIndex -= run.rowCount;
    }
    // We didn't find our row. It must have been out of range.
    throw Error(
      `Row index ${rowIndex} requested, but only ${this.totalRowsRead} row have been read so far.`,
    );
  }

  /**
   * Returns true if all rows have been read.
   */
  public get done(): boolean {
    return this.iteratorDone;
  }

  /**
   * Read all rows.
   */
  public async readAll(): Promise<void> {
    return this.read();
  }

  /**
   * Read rows until at least the given target row count has been met.
   *
   * Note that the resulting row count could be greater than the target, since rows are read in batches, typically of 2048 rows each.
   */
  public async readUntil(targetRowCount: number): Promise<void> {
    return this.read(targetRowCount);
  }

  private async read(targetRowCount?: number): Promise<void> {
    while (
      !(
        this.iteratorDone ||
        (targetRowCount !== undefined && this.totalRowsRead >= targetRowCount)
      )
    ) {
      const { value, done } = await this.iterator.next();
      if (value) {
        this.updateBatchSizeRuns(value);
        this.batches.push(value);
        this.totalRowsRead += value.rowCount;
      }
      if (done) {
        this.iteratorDone = done;
      }
    }
  }

  private updateBatchSizeRuns(batch: DuckDBData) {
    if (this.batchSizeRuns.length > 0) {
      const lastRun = this.batchSizeRuns[this.batchSizeRuns.length - 1];
      if (lastRun.batchSize === batch.rowCount) {
        // If the new batch is the same size as the last one, just update our last run.
        lastRun.batchCount += 1;
        lastRun.rowCount += lastRun.batchSize;
        return;
      }
    }
    // If this is our first batch, or it's a different size, create a new run.
    this.batchSizeRuns.push({
      batchCount: 1,
      batchSize: batch.rowCount,
      rowCount: batch.rowCount,
    });
  }
}
