import {
  AsyncDuckDBDataBatchIterator,
  DuckDBData,
  DuckDBDataBatchIteratorResult,
} from '@duckdb/data-reader';
import { SuccessQueryResult } from '../../serialization/types/QueryResult.js';
import { DuckDBDataChunk } from './DuckDBDataChunk.js';

const ITERATOR_DONE: DuckDBDataBatchIteratorResult = Object.freeze({
  done: true,
  value: undefined,
});

export class DuckDBDataChunkIterator implements AsyncDuckDBDataBatchIterator {
  private result: SuccessQueryResult;

  private index: number;

  constructor(result: SuccessQueryResult) {
    this.result = result;
    this.index = 0;
  }

  async next(): Promise<DuckDBDataBatchIteratorResult> {
    if (this.index < this.result.chunks.length) {
      return {
        done: false,
        value: new DuckDBDataChunk(
          this.result.columnNamesAndTypes,
          this.result.chunks[this.index++],
        ),
      };
    }
    return ITERATOR_DONE;
  }

  async return(value?: DuckDBData): Promise<DuckDBDataBatchIteratorResult> {
    if (value) {
      return { done: true, value };
    }
    return ITERATOR_DONE;
  }

  async throw(_e?: unknown): Promise<DuckDBDataBatchIteratorResult> {
    return ITERATOR_DONE;
  }

  [Symbol.asyncIterator](): AsyncDuckDBDataBatchIterator {
    return this;
  }
}
