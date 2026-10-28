import {
  Field,
  Float64,
  List,
  Struct,
  makeData,
  makeVector,
  type Data,
  type DataType,
  type Vector,
} from "apache-arrow";

// ---------------------------------------------------------------------------
// WKB → native GeoArrow, in the browser (#92).
//
// The map's deck.gl layers take GeoArrow's native "separated" layout: x/y
// coordinates as STRUCT(x DOUBLE, y DOUBLE), nested by LIST once per level —
// MultiPoint = LIST<coord>, MultiLineString = LIST<LIST<coord>>,
// MultiPolygon = LIST<LIST<LIST<coord>>> (polygons → rings → coords). DuckDB
// returns geometry as WKB (`ST_AsWKB`), so this decodes WKB straight into
// that layout: no `duck_geoarrow` extension (not published for DuckDB 1.4
// LTS, and an install at runtime), and no per-feature JS objects.
//
// Input rows are expected to be of one family, each either its single or its
// multi type; a single geometry becomes a one-part multi. Z and M values are
// skipped: the map is 2D.
// ---------------------------------------------------------------------------

export type GeometryFamily = "point" | "line" | "polygon";

// WKB geometry type codes (2D base; ISO adds 1000/2000/3000 for Z/M/ZM).
const POINT = 1;
const LINESTRING = 2;
const POLYGON = 3;
const MULTIPOINT = 4;
const MULTILINESTRING = 5;
const MULTIPOLYGON = 6;

const BASE_TYPE: Record<GeometryFamily, [number, number]> = {
  point: [POINT, MULTIPOINT],
  line: [LINESTRING, MULTILINESTRING],
  polygon: [POLYGON, MULTIPOLYGON],
};

/** A Float64Array/Int32Array that doubles its capacity as it fills. */
class Grow<T extends Float64Array | Int32Array> {
  length = 0;
  data: T;

  constructor(data: T) {
    this.data = data;
  }

  push(v: number): void {
    if (this.length === this.data.length) this.grow(this.length + 1);
    this.data[this.length++] = v;
  }

  /** Make room for `n` more values. */
  reserve(n: number): void {
    if (this.length + n > this.data.length) this.grow(this.length + n);
  }

  private grow(min: number): void {
    const next = new (this.data.constructor as new (n: number) => T)(Math.max(min, this.data.length * 2));
    next.set(this.data);
    this.data = next;
  }

  /** The filled part, without copying. */
  view(): T {
    return this.data.subarray(0, this.length) as T;
  }
}

/** Coordinates and per-level offsets, grown as geometries are decoded. */
class Builder {
  x: Grow<Float64Array>;
  y: Grow<Float64Array>;
  // One offsets array per list level: offsets[0] is the row level (indexing
  // its parts), each next level indexes the one below; the last indexes coords.
  offsets: Grow<Int32Array>[];
  readonly depth: number;

  constructor(depth: number, rows: number, coordHint: number) {
    this.depth = depth;
    this.x = new Grow(new Float64Array(Math.max(coordHint, 16)));
    this.y = new Grow(new Float64Array(Math.max(coordHint, 16)));
    this.offsets = Array.from({ length: depth }, () => {
      const o = new Grow(new Int32Array(rows + 1));
      o.push(0);
      return o;
    });
  }

  /** Close the current item at `level` (its children end here). */
  close(level: number): void {
    const child = level + 1 < this.depth ? this.offsets[level + 1].length - 1 : this.x.length;
    this.offsets[level].push(child);
  }
}

// The WKB being read: one DataView over a whole Arrow chunk's value buffer, a
// cursor into it, and the current geometry's byte order. Module state rather
// than a per-geometry object: decoding allocates nothing per row.
let view: DataView;
let pos = 0;
let little = true;
let dims = 2;

/** Read a geometry header; returns the 2D base type and sets `dims`. */
function header(): number {
  little = view.getUint8(pos) === 1;
  let code = view.getUint32(pos + 1, little);
  pos += 5;
  // EWKB flags (Z 0x80000000, M 0x40000000, SRID 0x20000000) or ISO codes.
  dims = 2;
  if (code & 0x80000000) dims++;
  if (code & 0x40000000) dims++;
  if (code & 0x20000000) pos += 4; // SRID
  code &= 0x0fffffff;
  const iso = Math.floor(code / 1000);
  if (iso === 1 || iso === 2) dims = 3;
  else if (iso === 3) dims = 4;
  return code % 1000;
}

function count(): number {
  const n = view.getUint32(pos, little);
  pos += 4;
  return n;
}

function coords(b: Builder, n: number): void {
  b.x.reserve(n);
  b.y.reserve(n);
  const xs = b.x.data;
  const ys = b.y.data;
  let i = b.x.length;
  const stride = dims * 8;
  // Separate loops so the byte order is a constant in the hot path.
  if (little) {
    for (let k = 0; k < n; k++, i++, pos += stride) {
      xs[i] = view.getFloat64(pos, true);
      ys[i] = view.getFloat64(pos + 8, true);
    }
  } else {
    for (let k = 0; k < n; k++, i++, pos += stride) {
      xs[i] = view.getFloat64(pos, false);
      ys[i] = view.getFloat64(pos + 8, false);
    }
  }
  b.x.length = i;
  b.y.length = i;
}

// Appends one geometry to the row being built: a multi geometry's parts, or a
// single geometry as the row's one part.
function readGeometry(b: Builder, family: GeometryFamily, expectMulti: boolean): void {
  const type = header();
  const [single, multi] = BASE_TYPE[family];
  if (expectMulti && type === multi) {
    const parts = count();
    for (let i = 0; i < parts; i++) readGeometry(b, family, false);
    return;
  }
  if (type !== single) {
    throw new Error(`unexpected WKB geometry type ${type} in a ${family} layer`);
  }
  // A single geometry as one part of the row's multi geometry.
  if (family === "point") {
    // An empty point is written as NaN coordinates: skip it.
    const before = b.x.length;
    coords(b, 1);
    if (Number.isNaN(b.x.data[before])) {
      b.x.length = before;
      b.y.length = before;
    }
    return;
  }
  if (family === "line") {
    coords(b, count());
    b.close(b.depth - 1);
    return;
  }
  const rings = count();
  for (let i = 0; i < rings; i++) {
    coords(b, count());
    b.close(b.depth - 1);
  }
  b.close(b.depth - 2);
}

/**
 * Decode a column of WKB (one multi geometry of `family` per row, or null) into
 * a native GeoArrow vector for the deck.gl layers.
 */
export function wkbToGeoArrow(wkb: Vector, family: GeometryFamily): Vector {
  // List levels: point → row (of coords); line → row, line (of coords);
  // polygon → row, polygon, ring (of coords).
  const depth = family === "point" ? 1 : family === "line" ? 2 : 3;
  // Every coordinate takes at least 16 bytes of WKB, so this bounds the count
  // (exact for 2D points; other geometries add headers and counts).
  let bytes = 0;
  for (const chunk of wkb.data) bytes += chunk.values?.byteLength ?? 0;
  const rows = new Builder(depth, wkb.length, Math.ceil(bytes / 21));
  const valid = new Uint8Array(Math.ceil(wkb.length / 8));
  let nullCount = 0;
  let row = 0;
  // Walk each Arrow chunk's buffers directly rather than `wkb.get(i)`, which
  // allocates a Uint8Array per row.
  for (const chunk of wkb.data) {
    const values = chunk.values as Uint8Array;
    const offsets = chunk.valueOffsets as Int32Array;
    view = new DataView(values.buffer, values.byteOffset, values.byteLength);
    for (let i = 0; i < chunk.length; i++, row++) {
      if (!chunk.getValid(i)) {
        nullCount++;
      } else {
        valid[row >> 3] |= 1 << (row & 7);
        const start = offsets[chunk.offset + i];
        if (offsets[chunk.offset + i + 1] > start) {
          pos = start;
          readGeometry(rows, family, true);
        }
      }
      rows.close(0);
    }
  }
  return makeVector(buildData(rows, valid, nullCount));
}

function buildData(b: Builder, valid: Uint8Array, nullCount: number): Data {
  const coordType = new Struct([
    new Field("x", new Float64(), false),
    new Field("y", new Float64(), false),
  ]);
  const n = b.x.length;
  let data: Data<DataType> = makeData({
    type: coordType,
    length: n,
    nullCount: 0,
    children: [
      makeData({ type: new Float64(), length: n, nullCount: 0, data: b.x.view() }),
      makeData({ type: new Float64(), length: n, nullCount: 0, data: b.y.view() }),
    ],
  });
  // Wrap from the innermost list level outwards; level 0 is the row.
  for (let level = b.depth - 1; level >= 0; level--) {
    const offsets = b.offsets[level].view();
    const isRow = level === 0;
    data = makeData({
      type: new List(new Field("item", data.type, false)),
      length: offsets.length - 1,
      nullCount: isRow ? nullCount : 0,
      nullBitmap: isRow && nullCount ? valid : undefined,
      valueOffsets: offsets,
      child: data,
    });
  }
  return data;
}
