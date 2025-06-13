import { Vector } from './Vector.js';

export interface DataChunk {
  rowCount: number;
  vectors: Vector[];
}
