import { ColumnNamesAndTypes } from './ColumnNamesAndTypes.js';
import { DataChunk } from './DataChunk.js';

export interface SuccessQueryResult {
  success: true;
  columnNamesAndTypes: ColumnNamesAndTypes;
  chunks: DataChunk[];
}

export interface ErrorQueryResult {
  success: false;
  error: string;
}

export type QueryResult = SuccessQueryResult | ErrorQueryResult;
