import { DuckDBDataReader } from '@duckdb/data-reader';
import { DuckDBDataChunkIterator } from '../../data-chunk/classes/DuckDBDataChunkIterator.js';
import { DuckDBUIHttpRequestQueueResult } from '../../http/classes/DuckDBUIHttpRequestQueue.js';
import { deserializerFromBuffer } from '../../serialization/functions/deserializeFromBuffer.js';
import { readQueryResult } from '../../serialization/functions/resultReaders.js';
import { MaterializedRunResult } from '../types/MaterializedRunResult.js';

export async function materializedRunResultFromQueueResult(
  queueResult: DuckDBUIHttpRequestQueueResult,
): Promise<MaterializedRunResult> {
  const { buffer, startTimeMs, endTimeMs } = queueResult;
  const deserializer = deserializerFromBuffer(buffer);
  const result = readQueryResult(deserializer);
  if (!result.success) {
    throw new Error(result.error);
  }
  const dataReader = new DuckDBDataReader(new DuckDBDataChunkIterator(result));
  await dataReader.readAll();
  return { data: dataReader, startTimeMs, endTimeMs };
}
