export interface ListEntry {
  offset: number;
  length: number;
}

export interface BaseVector {
  allValid: number;
  validity: DataView | null;
}

export interface DataVector extends BaseVector {
  kind: 'data';
  data: DataView;
}

export interface StringVector extends BaseVector {
  kind: 'string';
  data: string[];
}

export interface DataListVector extends BaseVector {
  kind: 'datalist';
  data: DataView[];
}

export interface VectorListVector extends BaseVector {
  kind: 'vectorlist';
  data: Vector[];
}

export interface ListVector extends BaseVector {
  kind: 'list';
  listSize: number;
  entries: ListEntry[];
  child: Vector;
}

export interface ArrayVector extends BaseVector {
  kind: 'array';
  arraySize: number;
  child: Vector;
}

/** See https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/types/vector.hpp */
export type Vector =
  | DataVector
  | StringVector
  | DataListVector
  | VectorListVector
  | ListVector
  | ArrayVector;
