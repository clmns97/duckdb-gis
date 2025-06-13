import { TokenizeResult } from '../types/TokenizeResult.js';
import { deserializerFromBuffer } from './deserializeFromBuffer.js';
import { readTokenizeResult } from './resultReaders.js';

export function tokenizeResultFromBuffer(buffer: ArrayBuffer): TokenizeResult {
  const deserializer = deserializerFromBuffer(buffer);
  return readTokenizeResult(deserializer);
}
