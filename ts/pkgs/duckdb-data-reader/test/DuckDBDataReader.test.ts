import { DuckDBType, INTEGER, VARCHAR } from '@duckdb/data-types';
import { DuckDBValue } from '@duckdb/data-values';
import { expect, suite, test } from 'vitest';
import {
  AsyncDuckDBDataBatchIterator,
  DuckDBData,
  DuckDBDataReader,
  MemoryDuckDBData,
} from '../src';

const ITERATOR_DONE = Object.freeze({ done: true, value: undefined });

class TestAsyncDuckDBDataBatchIterator implements AsyncDuckDBDataBatchIterator {
  private batches: readonly DuckDBData[];

  private nextBatchIndex: number | null;

  constructor(batches: readonly DuckDBData[]) {
    this.batches = batches;
    this.nextBatchIndex = this.batches.length > 0 ? 0 : null;
  }

  async next(): Promise<IteratorResult<DuckDBData, undefined>> {
    if (this.nextBatchIndex == null) {
      return ITERATOR_DONE;
    }
    const nextBatch = this.batches[this.nextBatchIndex++];
    if (this.nextBatchIndex >= this.batches.length) {
      this.nextBatchIndex = null;
    }
    return {
      done: this.nextBatchIndex == null,
      value: nextBatch,
    } as IteratorResult<DuckDBData, undefined>;
  }

  async return(): Promise<IteratorResult<DuckDBData, undefined>> {
    return ITERATOR_DONE;
  }

  async throw(_err: Error): Promise<IteratorResult<DuckDBData, undefined>> {
    return ITERATOR_DONE;
  }

  [Symbol.asyncIterator](): AsyncDuckDBDataBatchIterator {
    return this;
  }
}

function expectColumns(
  data: DuckDBData,
  columns: { name: string; type: DuckDBType }[],
) {
  expect(data.columnCount).toBe(columns.length);
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex];
    expect(data.columnName(columnIndex)).toBe(column.name);
    expect(data.columnType(columnIndex)).toStrictEqual(column.type);
  }
}

function expectValues(data: DuckDBData, values: DuckDBValue[][]) {
  for (let columnIndex = 0; columnIndex < values.length; columnIndex++) {
    const column = values[columnIndex];
    for (let rowIndex = 0; rowIndex < column.length; rowIndex++) {
      expect(data.value(columnIndex, rowIndex)).toBe(column[rowIndex]);
    }
  }
}

suite('DuckDBDataReader', () => {
  test('should work for an empty batch list', async () => {
    const batches: DuckDBData[] = [];
    const iterator = new TestAsyncDuckDBDataBatchIterator(batches);
    const reader = new DuckDBDataReader(iterator);
    expect(reader.done).toBe(false);
    expect(reader.columnCount).toBe(0);
    expect(reader.rowCount).toBe(0);
    await reader.readAll();
    expect(reader.done).toBe(true);
    expect(reader.columnCount).toBe(0);
    expect(reader.rowCount).toBe(0);
  });
  test('should work for a single batch', async () => {
    const columns = [
      { name: 'num', type: INTEGER },
      { name: 'str', type: VARCHAR },
    ];
    const values = [
      [2, 3, 5],
      ['z', 'y', 'x'],
    ];
    const batches: DuckDBData[] = [new MemoryDuckDBData(columns, values)];
    const iterator = new TestAsyncDuckDBDataBatchIterator(batches);
    const reader = new DuckDBDataReader(iterator);
    expect(reader.done).toBe(false);
    expect(reader.columnCount).toBe(0);
    expect(reader.rowCount).toBe(0);
    await reader.readAll();
    expect(reader.done).toBe(true);
    expectColumns(reader, columns);
    expect(reader.rowCount).toBe(3);
    expectValues(reader, values);
  });
  test('should work for multiple batches', async () => {
    const columns = [
      { name: 'num', type: INTEGER },
      { name: 'str', type: VARCHAR },
    ];
    const values = [
      [12, 13, 15, 22, 23, 25, 32, 33, 35],
      ['z1', 'y1', 'x1', 'z2', 'y2', 'x2', 'z3', 'y3', 'x3'],
    ];
    const batches: DuckDBData[] = [
      new MemoryDuckDBData(columns, [
        values[0].slice(0, 3),
        values[1].slice(0, 3),
      ]),
      new MemoryDuckDBData(columns, [
        values[0].slice(3, 6),
        values[1].slice(3, 6),
      ]),
      new MemoryDuckDBData(columns, [
        values[0].slice(6, 9),
        values[1].slice(6, 9),
      ]),
    ];
    const iterator = new TestAsyncDuckDBDataBatchIterator(batches);
    const reader = new DuckDBDataReader(iterator);
    expect(reader.done).toBe(false);
    expect(reader.columnCount).toBe(0);
    expect(reader.rowCount).toBe(0);
    await reader.readAll();
    expect(reader.done).toBe(true);
    expectColumns(reader, columns);
    expect(reader.rowCount).toBe(9);
    expectValues(reader, values);
  });
  test('should work for partial reads of multiple batches', async () => {
    const columns = [
      { name: 'num', type: INTEGER },
      { name: 'str', type: VARCHAR },
    ];
    const values = [
      [12, 13, 15, 22, 23, 25, 32, 33],
      ['z1', 'y1', 'x1', 'z2', 'y2', 'x2', 'z3', 'y3'],
    ];
    const batches: DuckDBData[] = [
      new MemoryDuckDBData(columns, [
        values[0].slice(0, 3),
        values[1].slice(0, 3),
      ]),
      new MemoryDuckDBData(columns, [
        values[0].slice(3, 6),
        values[1].slice(3, 6),
      ]),
      new MemoryDuckDBData(columns, [
        values[0].slice(6, 8),
        values[1].slice(6, 8),
      ]),
    ];
    const iterator = new TestAsyncDuckDBDataBatchIterator(batches);
    const reader = new DuckDBDataReader(iterator);
    expect(reader.done).toBe(false);
    expect(reader.columnCount).toBe(0);
    expect(reader.rowCount).toBe(0);
    await reader.readUntil(5);
    expect(reader.done).toBe(false);
    expectColumns(reader, columns);
    expect(reader.rowCount).toBe(6);
    expectValues(reader, [values[0].slice(0, 6), values[1].slice(0, 6)]);
    await reader.readUntil(10);
    expect(reader.done).toBe(true);
    expect(reader.rowCount).toBe(8);
    expectValues(reader, values);
  });
});
