import { BinaryDeserializer } from '../classes/BinaryDeserializer.js';
import { ColumnNamesAndTypes } from '../types/ColumnNamesAndTypes.js';
import { DataChunk } from '../types/DataChunk.js';
import {
  ErrorQueryResult,
  QueryResult,
  SuccessQueryResult,
} from '../types/QueryResult.js';
import { TokenizeResult } from '../types/TokenizeResult.js';
import { TypeIdAndInfo } from '../types/TypeInfo.js';
import {
  readBoolean,
  readList,
  readString,
  readStringList,
  readVarInt,
  readVarIntList,
} from './basicReaders.js';
import { readTypeList } from './typeReaders.js';
import { readVectorList } from './vectorReaders.js';

export function readTokenizeResult(
  deserializer: BinaryDeserializer,
): TokenizeResult {
  const offsets = deserializer.readProperty(100, readVarIntList);
  const types = deserializer.readProperty(101, readVarIntList);
  deserializer.expectObjectEnd();
  return { offsets, types };
}

export function readColumnNamesAndTypes(
  deserializer: BinaryDeserializer,
): ColumnNamesAndTypes {
  const names = deserializer.readProperty(100, readStringList);
  const types = deserializer.readProperty(101, readTypeList);
  deserializer.expectObjectEnd();
  return { names, types };
}

export function readChunk(
  deserializer: BinaryDeserializer,
  types: TypeIdAndInfo[],
): DataChunk {
  const rowCount = deserializer.readProperty(100, readVarInt);
  const vectors = deserializer.readProperty(101, (d) =>
    readVectorList(d, types),
  );
  deserializer.expectObjectEnd();
  return { rowCount, vectors };
}

export function readDataChunkList(
  deserializer: BinaryDeserializer,
  types: TypeIdAndInfo[],
): DataChunk[] {
  return readList(deserializer, (d) => readChunk(d, types));
}

export function readSuccessQueryResult(
  deserializer: BinaryDeserializer,
): SuccessQueryResult {
  const columnNamesAndTypes = deserializer.readProperty(
    101,
    readColumnNamesAndTypes,
  );
  const chunks = deserializer.readProperty(102, (d) =>
    readDataChunkList(d, columnNamesAndTypes.types),
  );
  return { success: true, columnNamesAndTypes, chunks };
}

export function readErrorQueryResult(
  deserializer: BinaryDeserializer,
): ErrorQueryResult {
  const error = deserializer.readProperty(101, readString);
  return { success: false, error };
}

export function readQueryResult(deserializer: BinaryDeserializer): QueryResult {
  const success = deserializer.readProperty(100, readBoolean);
  if (success) {
    return readSuccessQueryResult(deserializer);
  }
  return readErrorQueryResult(deserializer);
}
