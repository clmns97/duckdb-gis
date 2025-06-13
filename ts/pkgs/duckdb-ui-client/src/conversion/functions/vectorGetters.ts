import {
  ArrayVector,
  DataListVector,
  DataVector,
  ListVector,
  StringVector,
  Vector,
  VectorListVector,
} from '../../serialization/types/Vector.js';

export function getDataVector(vector: Vector): DataVector {
  if (vector.kind !== 'data') {
    throw new Error(`Unexpected vector.kind: ${vector.kind}`);
  }
  return vector;
}

export function getStringVector(vector: Vector): StringVector {
  if (vector.kind !== 'string') {
    throw new Error(`Unexpected vector.kind: ${vector.kind}`);
  }
  return vector;
}

export function getDataListVector(vector: Vector): DataListVector {
  if (vector.kind !== 'datalist') {
    throw new Error(`Unexpected vector.kind: ${vector.kind}`);
  }
  return vector;
}

export function getVectorListVector(vector: Vector): VectorListVector {
  if (vector.kind !== 'vectorlist') {
    throw new Error(`Unexpected vector.kind: ${vector.kind}`);
  }
  return vector;
}

export function getListVector(vector: Vector): ListVector {
  if (vector.kind !== 'list') {
    throw new Error(`Unexpected vector.kind: ${vector.kind}`);
  }
  return vector;
}

export function getArrayVector(vector: Vector): ArrayVector {
  if (vector.kind !== 'array') {
    throw new Error(`Unexpected vector.kind: ${vector.kind}`);
  }
  return vector;
}
