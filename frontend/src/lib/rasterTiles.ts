// ---------------------------------------------------------------------------
// Raster tile layers (#122): a WMS or WMTS layer drawn as image tiles.
//
// A `RasterSpec` is everything needed to fetch one tile — plain data, so it can
// be kept in a project file — built from the service's capabilities by
// rasterServices.ts. The tiles are drawn by deck.gl (TileLayer + BitmapLayer)
// rather than as a MapLibre raster source so that they sit in the same draw
// order as the vector layers (deckRender.ts) and reorder with them in the
// Layers panel. Both need the images served with CORS headers: WebGL can't
// draw a cross-origin image without them.
// ---------------------------------------------------------------------------

import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";

export interface RasterSpec {
  type: "wms" | "wmts";
  /** Tile URL template. WMS: `{bbox}`, the tile's EPSG:3857 extent. WMTS:
   *  `{z}` (looked up in `matrices`), `{x}` (column) and `{y}` (row). */
  url: string;
  /** WMTS: each zoom level's TileMatrix identifier (null where the set has none). */
  matrices?: Array<string | null>;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  /** [west, south, east, north] in lon/lat, when the service says. */
  bounds: [number, number, number, number] | null;
  /** Where it came from, for Layer Properties: the service address and layer name. */
  service: string;
  layer: string;
}

/** Half the width of the Web Mercator world, in metres. */
export const HALF = 20037508.342789244;

/** The URL of tile x/y at zoom z. */
export function tileUrl(spec: RasterSpec, x: number, y: number, z: number): string {
  if (spec.type === "wms") {
    const size = (2 * HALF) / 2 ** z;
    const bbox = [-HALF + x * size, HALF - (y + 1) * size, -HALF + (x + 1) * size, HALF - y * size];
    return spec.url.replace("{bbox}", bbox.join(","));
  }
  return spec.url
    .replace("{z}", spec.matrices?.[z] ?? String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** The tile x/y at zoom z that holds a lon/lat. */
export function tileAt(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

// One loader per spec: deck reloads a TileLayer's tiles only when its data or
// update triggers change, and the overlay rebuilds every layer on each sync.
type Image = ImageBitmap | null;
const loaders = new WeakMap<RasterSpec, (t: { index: { x: number; y: number; z: number }; signal?: AbortSignal }) => Promise<Image>>();
function loaderFor(spec: RasterSpec) {
  let load = loaders.get(spec);
  if (!load) {
    load = async ({ index: { x, y, z }, signal }) => {
      const r = await fetch(tileUrl(spec, x, y, z), { signal });
      // A tile outside the data or a server error (often an XML exception):
      // leave that tile empty.
      if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return null;
      return createImageBitmap(await r.blob());
    };
    loaders.set(spec, load);
  }
  return load;
}

/** The deck.gl layer drawing a raster layer's tiles. */
export function rasterTileLayer(
  id: string,
  spec: RasterSpec,
  opacity: number,
  visible: boolean,
): TileLayer<Image> {
  return new TileLayer<Image>({
    id: `raster-${id}`,
    getTileData: loaderFor(spec),
    tileSize: spec.tileSize,
    minZoom: spec.minZoom,
    maxZoom: spec.maxZoom,
    extent: spec.bounds ?? undefined,
    opacity,
    visible,
    pickable: false,
    onTileError: () => {}, // a failed tile stays empty; the add-time probe reports a dead service
    renderSubLayers: (props) => {
      const { west, south, east, north } = props.tile.bbox as { west: number; south: number; east: number; north: number };
      return props.data
        ? new BitmapLayer({ ...props, data: undefined, image: props.data, bounds: [west, south, east, north] })
        : null;
    },
  });
}
