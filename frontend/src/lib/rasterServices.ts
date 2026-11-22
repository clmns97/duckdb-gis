// ---------------------------------------------------------------------------
// WMS and WMTS services (#122): discovery, and adding a layer as raster tiles.
//
// These services return images, not features, so DuckDB has nothing to compute:
// it only fetches the capabilities document (`read_text`, no CORS needed),
// which is parsed here into a RasterSpec per layer. The tiles themselves are
// fetched by the browser (rasterTiles.ts), which does need CORS — `probeTile`
// checks one tile before the layer is added, so a server without it gets a
// clear error instead of a layer that silently draws nothing.
//
// The map is Web Mercator, so a WMS layer must offer EPSG:3857 and a WMTS layer
// a GoogleMapsCompatible tile matrix set (EPSG:3857, the world's top-left
// corner, 2^z tiles across at level z). Other layers are listed but marked
// unsupported, with the reason.
// ---------------------------------------------------------------------------

import {
  child,
  children,
  childText,
  descendants,
  fetchText,
  parseCapabilities,
  splitUrl,
  withParams,
  withoutParams,
} from "./serviceHttp";
import { getMap } from "./mapBus";
import { layers } from "./layers";
import { HALF, tileAt, tileUrl, type RasterSpec } from "./rasterTiles";
import type { Service, ServiceLayer } from "./webServices";

const WEB_MERCATOR = /^(?:EPSG:|urn:ogc:def:crs:EPSG:[\d.:]*:?)(3857|900913|102100|102113)$/i;

const xlinkHref = (el: Element | undefined): string | null =>
  el?.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? el?.getAttribute("xlink:href") ?? null;

/** The image format to ask for: PNG (transparent) first, then JPEG. */
function pickImageFormat(formats: string[]): string | undefined {
  return (
    formats.find((f) => f.toLowerCase() === "image/png") ??
    formats.find((f) => /^image\/png/i.test(f)) ??
    formats.find((f) => /^image\/jpe?g/i.test(f))
  );
}

/** Braces survive withParams' encoding as %7B…%7D; put the placeholders back. */
const unbrace = (url: string): string => url.replace(/%7B(\w+)%7D/gi, "{$1}");

// ---------------------------------------------------------------------------
// WMS
// ---------------------------------------------------------------------------

const WMS_OPERATION_PARAMS = [
  "service", "request", "version", "layers", "styles", "crs", "srs", "bbox",
  "width", "height", "format", "transparent",
];

/** A WMS layer's own and inherited (from enclosing Layers) values of `name`. */
function inherited(layer: Element, name: string): string[] {
  const out: string[] = [];
  for (let el: Element | null = layer; el?.localName === "Layer"; el = el.parentElement) {
    for (const c of children(el, name)) out.push(...(c.textContent ?? "").trim().split(/\s+/));
  }
  return out.filter(Boolean);
}

/** A WMS layer's lon/lat extent, from it or the nearest enclosing Layer. */
function wmsBounds(layer: Element): RasterSpec["bounds"] {
  for (let el: Element | null = layer; el?.localName === "Layer"; el = el.parentElement) {
    const ex = child(el, "EX_GeographicBoundingBox"); // 1.3.0
    if (ex) {
      const n = (k: string) => Number(childText(ex, k));
      return [n("westBoundLongitude"), n("southBoundLatitude"), n("eastBoundLongitude"), n("northBoundLatitude")];
    }
    const ll = child(el, "LatLonBoundingBox"); // 1.1.1
    if (ll) return (["minx", "miny", "maxx", "maxy"] as const).map((k) => Number(ll.getAttribute(k))) as RasterSpec["bounds"];
  }
  return null;
}

export async function connectWms(input: string): Promise<Service> {
  const url = withoutParams(input, WMS_OPERATION_PARAMS);
  const root = parseCapabilities(
    await fetchText(withParams(url, { SERVICE: "WMS", REQUEST: "GetCapabilities", VERSION: "1.3.0" })),
    ["WMS_Capabilities", "WMT_MS_Capabilities"],
    "WMS",
  );
  const version = root.getAttribute("version")?.startsWith("1.1") ? "1.1.1" : "1.3.0";
  const capability = child(root, "Capability");
  const getMap = child(child(capability, "Request"), "GetMap");
  const format = pickImageFormat(children(getMap, "Format").map((f) => f.textContent?.trim() ?? ""));

  const serviceLayers: ServiceLayer[] = (capability ? descendants(capability, "Layer") : [])
    .filter((l) => childText(l, "Name"))
    .map((l) => {
      const id = childText(l, "Name");
      const title = childText(l, "Title") || id;
      const crs = inherited(l, version === "1.3.0" ? "CRS" : "SRS").find((c) => WEB_MERCATOR.test(c));
      if (!format) return { id, title, unsupported: "The service offers no PNG or JPEG images." };
      if (!crs) {
        return { id, title, unsupported: `"${title}" isn't offered in Web Mercator (EPSG:3857), which the map needs.` };
      }
      const getMapUrl = withParams(url, {
        SERVICE: "WMS",
        VERSION: version,
        REQUEST: "GetMap",
        LAYERS: id,
        STYLES: "",
        [version === "1.3.0" ? "CRS" : "SRS"]: crs,
        BBOX: "{bbox}",
        WIDTH: 256,
        HEIGHT: 256,
        FORMAT: format,
        TRANSPARENT: "TRUE",
      });
      const raster: RasterSpec = {
        type: "wms",
        url: unbrace(getMapUrl),
        tileSize: 256,
        minZoom: 0,
        maxZoom: 22,
        bounds: wmsBounds(l),
        service: url,
        layer: id,
      };
      return { id, title, raster };
    });

  const service = child(root, "Service");
  return {
    type: "wms",
    url,
    title: childText(service, "Title") || new URL(url).host,
    layers: serviceLayers,
    version,
    paging: false,
  };
}

// ---------------------------------------------------------------------------
// WMTS
// ---------------------------------------------------------------------------

const WMTS_OPERATION_PARAMS = ["service", "request", "version"];

/** A tile matrix set's TileMatrix identifier per zoom level, and its tile
 *  size, when it is the GoogleMapsCompatible grid; null otherwise. */
function googleMatrices(set: Element): { matrices: Array<string | null>; tileSize: number } | null {
  if (!WEB_MERCATOR.test(childText(set, "SupportedCRS"))) return null;
  const matrices: Array<string | null> = [];
  let tileSize = 0;
  for (const m of children(set, "TileMatrix")) {
    const width = Number(childText(m, "MatrixWidth"));
    const z = Math.log2(width);
    const [x, y] = childText(m, "TopLeftCorner").split(/\s+/).map(Number);
    const size = Number(childText(m, "TileWidth"));
    const grid =
      Number.isInteger(z) && Number(childText(m, "MatrixHeight")) === width &&
      Math.abs(x + HALF) < 1 && Math.abs(y - HALF) < 1 && (!tileSize || size === tileSize);
    if (!grid) return null;
    tileSize = size;
    matrices[z] = childText(m, "Identifier");
  }
  return matrices.length ? { matrices: Array.from(matrices, (m) => m ?? null), tileSize } : null;
}

/** Fetch WMTS capabilities: a pasted …/WMTSCapabilities.xml as is; otherwise
 *  the KVP request, then the RESTful document under the address. */
async function wmtsCapabilities(input: string): Promise<{ root: Element; url: string }> {
  const [path] = splitUrl(input);
  const pasted = /\.xml$/i.test(path);
  const url = pasted ? input : withoutParams(input, WMTS_OPERATION_PARAMS);
  const attempts = pasted
    ? [input]
    : [withParams(url, { SERVICE: "WMTS", REQUEST: "GetCapabilities" }), `${path.replace(/\/+$/, "")}/1.0.0/WMTSCapabilities.xml`];
  let first: unknown;
  for (const a of attempts) {
    try {
      return { root: parseCapabilities(await fetchText(a), ["Capabilities"], "WMTS"), url };
    } catch (e) {
      first ??= e;
    }
  }
  throw first;
}

export async function connectWmts(input: string): Promise<Service> {
  const { root, url } = await wmtsCapabilities(input);
  const contents = child(root, "Contents");
  const sets = new Map(children(contents, "TileMatrixSet").map((s) => [childText(s, "Identifier"), s]));
  // KVP GetTile, for layers without a RESTful ResourceURL.
  const getTile = descendants(root, "Operation").find((o) => o.getAttribute("name") === "GetTile");
  const kvpBase = xlinkHref(getTile ? descendants(getTile, "Get")[0] : undefined) ?? splitUrl(url)[0];

  const serviceLayers: ServiceLayer[] = children(contents, "Layer").map((l) => {
    const id = childText(l, "Identifier");
    const title = childText(l, "Title") || id;
    const links = children(l, "TileMatrixSetLink").map((k) => childText(k, "TileMatrixSet"));
    const [setId, grid] =
      links.map((s) => [s, sets.has(s) ? googleMatrices(sets.get(s)!) : null] as const).find(([, g]) => g) ?? [];
    const formats = children(l, "Format").map((f) => f.textContent?.trim() ?? "");
    const tiles = children(l, "ResourceURL").filter((r) => (r.getAttribute("resourceType") ?? "tile") === "tile");
    const format = pickImageFormat([...formats, ...tiles.map((r) => r.getAttribute("format") ?? "")]);
    if (!setId || !grid) {
      return {
        id,
        title,
        unsupported: `"${title}" has no Web Mercator (GoogleMapsCompatible) tile matrix set — only ${links.join(", ") || "none"}.`,
      };
    }
    if (!format) return { id, title, unsupported: `"${title}" offers no PNG or JPEG tiles.` };
    const { matrices, tileSize } = grid;

    const styles = children(l, "Style");
    const style = childText(styles.find((s) => s.getAttribute("isDefault") === "true") ?? styles[0], "Identifier") || "default";
    // Dimensions (GIBS's Time, say) take their default value.
    const dims = new Map(children(l, "Dimension").map((d) => [childText(d, "Identifier").toLowerCase(), childText(d, "Default")]));
    const fill = (template: string) =>
      template.replace(/\{(\w+)\}/g, (m, k: string) => {
        const key = k.toLowerCase();
        if (key === "tilematrix") return "{z}";
        if (key === "tilerow") return "{y}";
        if (key === "tilecol") return "{x}";
        if (key === "tilematrixset") return setId;
        if (key === "style") return style;
        return dims.get(key) || m;
      });
    // The chosen format's template first, then any other image template.
    const rest = tiles
      .filter((r) => /^image\//i.test(r.getAttribute("format") ?? ""))
      .sort((a, b) => Number(b.getAttribute("format") === format) - Number(a.getAttribute("format") === format))
      .map((r) => fill(r.getAttribute("template") ?? ""))
      .find((t) => t && !/\{(?![xyz]\})\w+\}/.test(t));
    const kvp = unbrace(
      withParams(kvpBase, {
        SERVICE: "WMTS",
        REQUEST: "GetTile",
        VERSION: "1.0.0",
        LAYER: id,
        STYLE: style,
        TILEMATRIXSET: setId,
        TILEMATRIX: "{z}",
        TILEROW: "{y}",
        TILECOL: "{x}",
        FORMAT: format,
      }),
    );
    const levels = matrices.flatMap((m, z) => (m == null ? [] : [z]));
    const box = child(l, "WGS84BoundingBox");
    const corner = (k: string) => childText(box, k).split(/\s+/).map(Number);
    const raster: RasterSpec = {
      type: "wmts",
      url: rest ?? kvp,
      matrices,
      tileSize,
      minZoom: levels[0],
      maxZoom: levels[levels.length - 1],
      bounds: box ? ([...corner("LowerCorner"), ...corner("UpperCorner")] as RasterSpec["bounds"]) : null,
      service: url,
      layer: id,
    };
    return { id, title, raster };
  });

  const info = descendants(root, "ServiceIdentification")[0];
  return {
    type: "wmts",
    url,
    title: childText(info, "Title") || new URL(url).host,
    layers: serviceLayers,
    version: "1.0.0",
    paging: false,
  };
}

// ---------------------------------------------------------------------------
// Adding a layer
// ---------------------------------------------------------------------------

/**
 * Fetch one tile of the current view (or of the layer's extent, when the view
 * is outside it) the way the map will — from the browser, with CORS — and
 * throw a readable error when that can't work.
 */
async function probeTile(spec: RasterSpec): Promise<void> {
  const map = getMap();
  const center = map?.getCenter();
  let [lon, lat] = center ? [center.lng, center.lat] : [0, 0];
  if (spec.bounds) {
    const [w, s, e, n] = spec.bounds;
    if (lon < w || lon > e || lat < s || lat > n) [lon, lat] = [(w + e) / 2, (s + n) / 2];
  }
  const z = Math.min(spec.maxZoom, Math.max(spec.minZoom, Math.round(map?.getZoom() ?? spec.minZoom)));
  const [x, y] = tileAt(lon, lat, z);
  let r: Response;
  try {
    r = await fetch(tileUrl(spec, x, y, z));
  } catch {
    throw new Error(
      "The service's images can't be drawn on the map: it doesn't send CORS headers " +
        "(Access-Control-Allow-Origin), or it can't be reached.",
    );
  }
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || !type.startsWith("image/")) {
    const body = await r.text().catch(() => "");
    const text = new DOMParser().parseFromString(body, "text/html").body.textContent?.trim() ?? "";
    throw new Error(
      `The service didn't answer with an image (HTTP ${r.status}${type ? `, ${type}` : ""})` +
        (text ? `: ${text.replace(/\s+/g, " ").slice(0, 300)}` : "."),
    );
  }
}

/** Add a WMS/WMTS layer to the map as raster tiles, after checking a tile loads. */
export async function addRasterLayer(layer: ServiceLayer): Promise<void> {
  if (!layer.raster) throw new Error(layer.unsupported ?? "This layer can't be drawn on the map.");
  await probeTile(layer.raster);
  layers.addRaster(layer.title, layer.raster);
}
