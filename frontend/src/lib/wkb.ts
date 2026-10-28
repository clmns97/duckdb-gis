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
// Input rows are expected to be of one family, folded onto its multi type with
// `ST_Multi` (a single point, line or polygon is also accepted). Z and M
// values are skipped: the map is 2D.
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

/** Coordinates and per-level offsets, grown as geometries are decoded. */
class Builder {
  x: number[] = [];
  y: number[] = [];
  // One offsets array per list level: offsets[0] is the row level (indexing
  // its parts), each next level indexes the one below; the last indexes coords.
  offsets: number[][];
  valid: boolean[] = [];
  readonly depth: number;

  constructor(depth: number) {
    this.depth = depth;
    this.offsets = Array.from({ length: depth }, () => [0]);
  }

  /** Close the current item at `level` (its children end here). */
  close(level: number): void {
    const child = level + 1 < this.depth ? this.offsets[level + 1].length - 1 : this.x.length;
    this.offsets[level].push(child);
  }
}

class Reader {
  private pos = 0;
  private little = true;
  private readonly view: DataView;

  constructor(view: DataView) {
    this.view = view;
  }

  header(): { type: number; dims: number } {
    this.little = this.view.getUint8(this.pos) === 1;
    this.pos += 1;
    let code = this.view.getUint32(this.pos, this.little);
    this.pos += 4;
    // EWKB flags (Z 0x80000000, M 0x40000000, SRID 0x20000000) or ISO codes.
    let dims = 2;
    if (code & 0x80000000) dims++;
    if (code & 0x40000000) dims++;
    if (code & 0x20000000) this.pos += 4; // SRID
    code &= 0x0fffffff;
    const iso = Math.floor(code / 1000);
    if (iso === 1 || iso === 2) dims = 3;
    else if (iso === 3) dims = 4;
    return { type: code % 1000, dims };
  }

  count(): number {
    const n = this.view.getUint32(this.pos, this.little);
    this.pos += 4;
    return n;
  }

  coords(b: Builder, n: number, dims: number): void {
    for (let i = 0; i < n; i++) {
      b.x.push(this.view.getFloat64(this.pos, this.little));
      b.y.push(this.view.getFloat64(this.pos + 8, this.little));
      this.pos += dims * 8;
    }
  }
}

// Appends one geometry to the row being built: a multi geometry's parts, or a
// single geometry as the row's one part.
function readGeometry(r: Reader, b: Builder, family: GeometryFamily, expectMulti: boolean): void {
  const { type, dims } = r.header();
  const [single, multi] = BASE_TYPE[family];
  if (expectMulti && type === multi) {
    const parts = r.count();
    for (let i = 0; i < parts; i++) readGeometry(r, b, family, false);
    return;
  }
  if (type !== single) {
    throw new Error(`unexpected WKB geometry type ${type} in a ${family} layer`);
  }
  // A single geometry as one part of the row's multi geometry.
  if (family === "point") {
    // An empty point is written as NaN coordinates: skip it.
    const before = b.x.length;
    r.coords(b, 1, dims);
    if (Number.isNaN(b.x[before])) {
      b.x.length = before;
      b.y.length = before;
    }
    return;
  }
  if (family === "line") {
    r.coords(b, r.count(), dims);
    b.close(b.depth - 1);
    return;
  }
  const rings = r.count();
  for (let i = 0; i < rings; i++) {
    r.coords(b, r.count(), dims);
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
  const rows = new Builder(depth);
  for (let i = 0; i < wkb.length; i++) {
    const value = wkb.get(i) as Uint8Array | null;
    rows.valid.push(value != null);
    if (value != null && value.byteLength > 0) {
      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      readGeometry(new Reader(view), rows, family, true);
    }
    rows.close(0);
  }
  return makeVector(buildData(rows));
}

function buildData(b: Builder): Data {
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
      makeData({ type: new Float64(), length: n, nullCount: 0, data: Float64Array.from(b.x) }),
      makeData({ type: new Float64(), length: n, nullCount: 0, data: Float64Array.from(b.y) }),
    ],
  });
  // Wrap from the innermost list level outwards; level 0 is the row.
  for (let level = b.depth - 1; level >= 0; level--) {
    const offsets = b.offsets[level];
    const length = offsets.length - 1;
    const isRow = level === 0;
    const nullCount = isRow ? b.valid.filter((v) => !v).length : 0;
    data = makeData({
      type: new List(new Field("item", data.type, false)),
      length,
      nullCount,
      nullBitmap: nullCount ? bitmap(b.valid) : undefined,
      valueOffsets: Int32Array.from(offsets),
      child: data,
    });
  }
  return data;
}

function bitmap(valid: boolean[]): Uint8Array {
  const bits = new Uint8Array(Math.ceil(valid.length / 8));
  valid.forEach((v, i) => {
    if (v) bits[i >> 3] |= 1 << (i & 7);
  });
  return bits;
}
