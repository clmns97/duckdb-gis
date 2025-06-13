import {
  DOUBLE,
  DuckDBBlobType,
  DuckDBVarCharType,
  FLOAT,
  HUGEINT,
  LIST,
  STRUCT,
  USMALLINT,
  UTINYINT,
} from './DuckDBType.js';

// see https://github.com/duckdb/duckdb-inet/blob/main/src/inet_extension.cpp
export const INET = STRUCT(
  { ip_type: UTINYINT, address: HUGEINT, mask: USMALLINT },
  'INET',
);

// see LogicalType::JSON() in https://github.com/duckdb/duckdb/blob/main/src/common/types.cpp
export const JSONType = DuckDBVarCharType.create('JSON');

// see https://github.com/duckdb/duckdb-spatial/blob/main/src/spatial/spatial_types.cpp
export const BOX_2D = STRUCT(
  { min_x: DOUBLE, min_y: DOUBLE, max_x: DOUBLE, max_y: DOUBLE },
  'BOX_2D',
);
export const BOX_2DF = STRUCT(
  { min_x: FLOAT, min_y: FLOAT, max_x: FLOAT, max_y: FLOAT },
  'BOX_2DF',
);
export const GEOMETRY = DuckDBBlobType.create('GEOMETRY');
export const LINESTRING_2D = LIST(
  STRUCT({ x: DOUBLE, y: DOUBLE }),
  'LINESTRING_2D',
);
export const POINT_2D = STRUCT({ x: DOUBLE, y: DOUBLE }, 'POINT_2D');
export const POINT_3D = STRUCT({ x: DOUBLE, y: DOUBLE, z: DOUBLE }, 'POINT_3D');
export const POINT_4D = STRUCT(
  { x: DOUBLE, y: DOUBLE, z: DOUBLE, m: DOUBLE },
  'POINT_4D',
);
export const POLYGON_2D = LIST(
  LIST(STRUCT({ x: DOUBLE, y: DOUBLE })),
  'POLYGON_2D',
);
export const WKB_BLOB = DuckDBBlobType.create('WKB_BLOB');
