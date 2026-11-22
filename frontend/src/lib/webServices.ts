// ---------------------------------------------------------------------------
// Web feature services (#121): add a layer from a WFS, an OGC API – Features
// collection or an ArcGIS REST feature layer.
//
// DuckDB does the network work, not the browser: discovery documents come
// through `read_text` (parsed here — XML with DOMParser, JSON with JSON.parse)
// and feature pages through `read_json`, so a service needs no CORS headers.
// One `read_json` download yields a page's features *and* its paging metadata
// (OGC API `next` links, `numberMatched`, ArcGIS `exceededTransferLimit`),
// which is why GeoJSON doesn't go through `ST_Read` (it drops the metadata) or
// GDAL's own `WFS:` driver (it hung in testing). A WFS that offers no GeoJSON
// is read as GML through `ST_Read` instead — see readGmlPage.
//
// Fetch strategy, following #59 (filter to the viewport once, cap, tell the
// user): adding a layer fetches the features in the current map view, paged,
// up to VIEW_CAP, into a table in the working catalog — an ordinary table
// layer from then on. "Refresh for current view" / "Download whole layer"
// re-run the fetch into the same table. Nothing refetches on pan/zoom.
//
// Server quirks handled here:
//   • GeoServer streams responses DuckDB's ranged HTTP reads choke on ("Short
//     read for HTTP GET"); `force_download` avoids them. It's switched on per
//     request with SET SESSION on the session connection only — Overture's
//     pooled S3 reads depend on ranged reads.
//   • `*` in a URL trips DuckDB's glob check, so it's sent as %2A.
//   • A page that isn't valid UTF-8 (a legacy-encoded server) is re-read as
//     Latin-1 instead of failing — see readLatin1Page.
//   • A WFS may answer EPSG:4326 in lat/lon order; a page set that misses the
//     requested bbox but hits it once flipped gets its coordinates flipped.
// ---------------------------------------------------------------------------

import { query, str, sqlLit, ident, errMsg, type Row } from "./duckdb";
import { ensureHttpfs } from "./remote";
import { WORKING_CATALOG } from "./workspace";
import { freeTableName } from "./geoprocessing";
import { layers, layerId, type LayerSource } from "./layers";
import { unsavedChanges } from "./unsavedChanges";
import { getMap } from "./mapBus";
import { changeSignal } from "./store";

export type ServiceType = "wfs" | "ogcapi" | "arcgis";

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  wfs: "WFS",
  ogcapi: "OGC API – Features",
  arcgis: "ArcGIS REST",
};

/** One layer a service offers: a WFS feature type, an OGC API collection or an
 *  ArcGIS layer (by its numeric id). */
export interface ServiceLayer {
  id: string;
  title: string;
}

export interface Service {
  type: ServiceType;
  /** WFS: the endpoint without operation params; OGC API: the landing page;
   *  ArcGIS: the …/FeatureServer or …/MapServer address. */
  url: string;
  title: string;
  layers: ServiceLayer[];
  /** WFS: the negotiated version (2.0.0 or 1.1.0) and its GeoJSON format name —
   *  none when it offers only GML, which is then requested (as its default
   *  output) instead, with `gml` set. */
  version?: string;
  outputFormat?: string;
  gml?: boolean;
  /** WFS 2.0 `ImplementsResultPaging`; OGC API and ArcGIS always page. */
  paging: boolean;
  /** OGC API: each collection's items URL, from its `items` link. */
  itemsUrls?: Record<string, string>;
  /** ArcGIS: the server's per-request record limit (`maxRecordCount`). */
  pageLimit?: number;
}

/** [west, south, east, north] in lon/lat. */
export type Bbox = [number, number, number, number];

const PAGE_SIZE = 1000;
/** Features fetched for the current view before the layer is marked partial. */
export const VIEW_CAP = 10_000;
/** Ceiling for "Download whole layer". */
export const DOWNLOAD_CAP = 100_000;

// ---------------------------------------------------------------------------
// HTTP through DuckDB
// ---------------------------------------------------------------------------

const duckUrl = (url: string): string => url.replace(/\*/g, "%2A");

// Commas and colons stay literal: BBOX values and CRS URNs go out the way
// servers document them.
const enc = (v: string): string =>
  encodeURIComponent(v).replace(/%2C/gi, ",").replace(/%3A/gi, ":");

function splitUrl(url: string): [string, string[]] {
  const q = url.indexOf("?");
  if (q === -1) return [url, []];
  return [url.slice(0, q), url.slice(q + 1).split("&").filter(Boolean)];
}

/** `url` with `params` set, replacing same-named ones (case-insensitive — a
 *  pasted GetCapabilities URL's REQUEST, say) and keeping the rest of its
 *  query (MapServer's `map=`, an access token). */
function withParams(url: string, params: Record<string, string | number>): string {
  const [base, pairs] = splitUrl(url);
  const names = new Set(Object.keys(params).map((k) => k.toLowerCase()));
  const kept = pairs.filter((kv) => !names.has(kv.split("=")[0].toLowerCase()));
  const added = Object.entries(params).map(([k, v]) => `${k}=${enc(String(v))}`);
  return `${base}?${[...kept, ...added].join("&")}`;
}

/** `url` without the named query params (case-insensitive). */
function withoutParams(url: string, names: string[]): string {
  const [base, pairs] = splitUrl(url);
  const drop = new Set(names);
  const kept = pairs.filter((kv) => !drop.has(kv.split("=")[0].toLowerCase()));
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

/**
 * Run `statements` (which read over HTTP) with `force_download` on, then
 * `final`, on the session connection. One request, so nothing else on the
 * session runs with the setting on; reset again if a statement fails.
 */
async function download(statements: string, final: string): Promise<Row[]> {
  await ensureHttpfs();
  try {
    return await query(
      `SET SESSION force_download = true; ${statements}; RESET SESSION force_download; ${final}`,
    );
  } catch (e) {
    await query("RESET SESSION force_download").catch(() => {});
    throw e;
  }
}

async function fetchText(url: string): Promise<string> {
  const rows = await download(
    `CREATE OR REPLACE TEMP TABLE _gis_ws_text AS SELECT content FROM read_text('${sqlLit(duckUrl(url))}')`,
    `SELECT content FROM _gis_ws_text`,
  );
  await query("DROP TABLE IF EXISTS _gis_ws_text"); // or the Browser shows a temp schema
  return str(rows[0]?.content);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string): Promise<any> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} did not answer with JSON`);
  }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** The service type an address looks like, or null when it doesn't say. */
export function guessType(url: string): ServiceType | null {
  const [path] = splitUrl(url.trim());
  if (/\/(FeatureServer|MapServer)(\/\d+)?\/?$/i.test(path)) return "arcgis";
  // "wfs" anywhere in the last path segment: /geoserver/wfs, /wfs_vg250, /ows.
  if (/[?&]service=wfs(&|$)/i.test(url) || /\/([^/]*wfs[^/]*|ows)\/?$/i.test(path)) return "wfs";
  if (/\/collections(\/[^/]+)?(\/items)?\/?$/i.test(path)) return "ogcapi";
  return null;
}

/** Connect to a service and list its feature layers. `type: "auto"` guesses
 *  from the address, then tries OGC API and WFS in turn. */
export async function connect(input: string, type: ServiceType | "auto"): Promise<Service> {
  const url = input.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Enter an http:// or https:// service address.");
  const kind = type === "auto" ? guessType(url) : type;
  if (kind === "wfs") return connectWfs(url);
  if (kind === "ogcapi") return connectOgc(url);
  if (kind === "arcgis") return connectArcgis(url);
  try {
    return await connectOgc(url);
  } catch {
    // not an OGC API landing page — try WFS next
  }
  try {
    return await connectWfs(url);
  } catch (e) {
    throw new Error(
      `Couldn't recognise this address as a WFS, OGC API – Features or ArcGIS REST service (${errMsg(e)}).`,
    );
  }
}

const WFS_OPERATION_PARAMS = [
  "service", "request", "version", "acceptversions", "typename", "typenames",
  "outputformat", "srsname", "bbox", "count", "maxfeatures", "startindex", "resulttype",
];

// Namespace-agnostic XML helpers: WFS 1.1 and 2.0 put the same elements in
// different namespaces (wfs/ows 1.0/ows 1.1).
const descendants = (el: Element, name: string): Element[] =>
  Array.from(el.getElementsByTagNameNS("*", name));
const child = (el: Element | undefined, name: string): Element | undefined =>
  el ? Array.from(el.children).find((c) => c.localName === name) : undefined;
const childText = (el: Element | undefined, name: string): string =>
  child(el, name)?.textContent?.trim() ?? "";

/** The GeoJSON output format among a WFS's advertised ones (MapServer calls
 *  it `application/json; subtype=geojson`), preferring the plain names. */
function pickJsonFormat(formats: string[]): string | undefined {
  const exact = ["application/json", "application/geo+json", "json", "geojson"];
  return (
    exact.find((f) => formats.some((g) => g.toLowerCase() === f)) ??
    formats.find((f) => /json/i.test(f) && !/jsonp|javascript/i.test(f))
  );
}

async function connectWfs(input: string): Promise<Service> {
  const url = withoutParams(input, WFS_OPERATION_PARAMS);
  const xml = await fetchText(
    withParams(url, { SERVICE: "WFS", REQUEST: "GetCapabilities", ACCEPTVERSIONS: "2.0.0,1.1.0" }),
  );
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("the GetCapabilities answer isn't XML");
  }
  if (/ExceptionReport$/.test(root.localName)) {
    throw new Error(`the server says: ${root.textContent?.trim().slice(0, 300)}`);
  }
  if (root.localName !== "WFS_Capabilities") throw new Error("not a WFS GetCapabilities document");

  const version = root.getAttribute("version") ?? "";
  if (!/^(2\.0|1\.1)/.test(version)) {
    throw new Error(`WFS ${version || "(unknown version)"} isn't supported — it needs WFS 1.1 or 2.0`);
  }
  const getFeature = descendants(root, "Operation").find((o) => o.getAttribute("name") === "GetFeature");
  const formatParam = getFeature
    ? descendants(getFeature, "Parameter").find((p) => p.getAttribute("name")?.toLowerCase() === "outputformat")
    : undefined;
  const formats = [
    ...(formatParam ? descendants(formatParam, "Value") : []),
    ...descendants(root, "OutputFormats").flatMap((o) => descendants(o, "Format")),
  ].map((v) => v.textContent?.trim() ?? "");
  const outputFormat = pickJsonFormat(formats);
  const pagingConstraint = descendants(root, "Constraint").find(
    (c) => c.getAttribute("name") === "ImplementsResultPaging",
  );
  const paging =
    version.startsWith("2.0") &&
    childText(pagingConstraint, "DefaultValue").toUpperCase() === "TRUE";

  const serviceInfo = descendants(root, "ServiceIdentification")[0] ?? descendants(root, "Service")[0];
  return {
    type: "wfs",
    url,
    title: childText(serviceInfo, "Title") || new URL(url).host,
    layers: descendants(root, "FeatureType")
      .map((ft) => {
        const id = childText(ft, "Name");
        return { id, title: childText(ft, "Title") || id };
      })
      .filter((l) => l.id),
    version: version.startsWith("2.0") ? "2.0.0" : "1.1.0",
    outputFormat,
    ...(outputFormat ? {} : { gml: true }),
    paging,
  };
}

async function connectOgc(input: string): Promise<Service> {
  const [path] = splitUrl(input);
  const trimmed = path.replace(/\/+$/, "");
  const m = /^(.*)\/collections(?:\/([^/]+))?(?:\/items)?$/i.exec(trimmed);
  const landing = m ? m[1] : trimmed;
  const only = m?.[2] ? decodeURIComponent(m[2]) : null;
  const doc = await fetchJson(`${landing}/collections?f=json`);
  if (!Array.isArray(doc?.collections)) throw new Error("no OGC API collections list");

  const itemsUrls: Record<string, string> = {};
  const collections = (doc.collections as Array<Record<string, unknown>>).filter(
    (c) => (!c.itemType || c.itemType === "feature") && (!only || c.id === only),
  );
  for (const c of collections) {
    const id = String(c.id);
    const links = (c.links as Array<{ rel?: string; type?: string; href?: string }>) ?? [];
    const items =
      links.find((l) => l.rel === "items" && /geo\+json/i.test(l.type ?? "")) ??
      links.find((l) => l.rel === "items" && /json/i.test(l.type ?? ""));
    itemsUrls[id] = items?.href
      ? new URL(items.href, `${landing}/collections/`).href
      : `${landing}/collections/${encodeURIComponent(id)}/items?f=json`;
  }
  return {
    type: "ogcapi",
    url: landing,
    title: typeof doc.title === "string" ? doc.title : new URL(landing).host,
    layers: collections.map((c) => ({ id: String(c.id), title: String(c.title ?? c.id) })),
    paging: true,
    itemsUrls,
  };
}

async function connectArcgis(input: string): Promise<Service> {
  const [path] = splitUrl(input);
  const m = /^(.*\/(?:FeatureServer|MapServer))(?:\/(\d+))?\/?$/i.exec(path);
  if (!m) throw new Error("expected a …/FeatureServer or …/MapServer address");
  const [, base, only] = m;
  const doc = await fetchJson(`${base}?f=json`);
  if (doc?.error) throw new Error(`the server says: ${doc.error.message ?? JSON.stringify(doc.error)}`);
  type ArcLayer = { id: number; name: string; subLayerIds?: number[] | null };
  const all = (doc?.layers as ArcLayer[] | undefined) ?? [];
  return {
    type: "arcgis",
    url: base,
    title: doc?.documentInfo?.Title || base.split("/").slice(-2, -1)[0] || new URL(base).host,
    // Group layers hold no features of their own; their sub-layers are listed too.
    layers: all
      .filter((l) => !l.subLayerIds?.length && (!only || String(l.id) === only))
      .map((l) => ({ id: String(l.id), title: l.name })),
    paging: true,
    pageLimit: typeof doc?.maxRecordCount === "number" ? doc.maxRecordCount : undefined,
  };
}

// ---------------------------------------------------------------------------
// Feature requests
// ---------------------------------------------------------------------------

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

/** The current map view as a lon/lat bbox, clamped to the world. */
export function viewBbox(): Bbox | null {
  const map = getMap();
  if (!map) return null;
  const b = map.getBounds();
  return [
    round(Math.max(-180, b.getWest())),
    round(Math.max(-90, b.getSouth())),
    round(Math.min(180, b.getEast())),
    round(Math.min(90, b.getNorth())),
  ];
}

function pageSize(s: Service): number {
  return Math.min(PAGE_SIZE, s.pageLimit ?? PAGE_SIZE);
}

/** The OUTPUTFORMAT param: GeoJSON's name, or none for the server's GML. */
const wfsFormat = (s: Service): Record<string, string> =>
  s.outputFormat ? { OUTPUTFORMAT: s.outputFormat } : {};

function wfsUrl(s: Service, layer: string, bbox: Bbox | null, extra: Record<string, string | number>): string {
  const v2 = s.version === "2.0.0";
  const params: Record<string, string | number> = {
    SERVICE: "WFS",
    VERSION: s.version!,
    REQUEST: "GetFeature",
    [v2 ? "TYPENAMES" : "TYPENAME"]: layer,
    ...extra,
  };
  if (bbox) {
    const [w, so, e, n] = bbox;
    // CRS84 is lon/lat by definition; WFS 1.1 servers may not know it, so
    // they get the EPSG URN, which is lat/lon by definition.
    params.BBOX = v2 ? `${w},${so},${e},${n},urn:ogc:def:crs:OGC:1.3:CRS84` : `${so},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`;
  }
  return withParams(s.url, params);
}

function arcgisQueryUrl(s: Service, layer: string, bbox: Bbox | null, extra: Record<string, string | number>): string {
  const params: Record<string, string | number> = { where: "1=1", ...extra };
  if (bbox) {
    Object.assign(params, {
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: 4326,
      spatialRel: "esriSpatialRelIntersects",
    });
  }
  return withParams(`${s.url}/${layer}/query`, params);
}

/** The URL of `layer`'s features page starting at `offset` (OGC API's later
 *  pages come from its `next` links instead). */
function pageUrl(s: Service, layer: string, bbox: Bbox | null, offset: number, limit: number): string {
  switch (s.type) {
    case "wfs":
      return wfsUrl(s, layer, bbox, {
        ...wfsFormat(s),
        SRSNAME: "EPSG:4326",
        [s.version === "2.0.0" ? "COUNT" : "MAXFEATURES"]: limit,
        ...(s.paging ? { STARTINDEX: offset } : {}),
      });
    case "ogcapi":
      return withParams(s.itemsUrls![layer], { limit, ...(bbox ? { bbox: bbox.join(",") } : {}) });
    case "arcgis":
      return arcgisQueryUrl(s, layer, bbox, {
        outFields: "*",
        outSR: 4326,
        f: "geojson",
        resultOffset: offset,
        resultRecordCount: limit,
      });
  }
}

/** The URL of the page after the one just read, or null when it was the last.
 *  `offset` counts the features the service has returned so far; `short`, that
 *  the page held fewer than were asked for. */
function nextPageUrl(
  s: Service,
  layer: string,
  bbox: Bbox | null,
  meta: Row,
  offset: number,
  short: boolean,
  limit: number,
): string | null {
  switch (s.type) {
    case "wfs":
      // A short page is the last one — unless the server caps pages below our
      // COUNT (its CountDefault) and its numberMatched says there's more.
      if (!s.paging || (short && !(Number(meta.numberMatched ?? NaN) > offset))) return null;
      break;
    case "ogcapi": {
      const links = Array.isArray(meta.links) ? (meta.links as Array<{ rel?: string; href?: string }>) : [];
      const next = links.find((l) => l.rel === "next")?.href;
      return next ? new URL(next, s.itemsUrls![layer]).href : null;
    }
    case "arcgis": {
      const props = (meta.properties ?? {}) as Record<string, unknown>;
      const more = props.exceededTransferLimit === true || meta.exceededTransferLimit === true;
      if (!more && short) return null;
    }
  }
  return pageUrl(s, layer, bbox, offset, limit);
}

/** How many features the service has for `layer` within `bbox` (all of it
 *  when null), or null when it won't say. */
async function countFeatures(s: Service, layer: string, bbox: Bbox | null): Promise<number | null> {
  try {
    switch (s.type) {
      case "wfs": {
        const xml = await fetchText(wfsUrl(s, layer, bbox, { RESULTTYPE: "hits" }));
        const m = /\b(?:numberMatched|numberOfFeatures)="(\d+)"/.exec(xml);
        return m ? Number(m[1]) : null;
      }
      case "ogcapi": {
        const meta = await readPageMeta(pageUrl(s, layer, bbox, 0, 1));
        return typeof meta.numberMatched === "number" || typeof meta.numberMatched === "bigint"
          ? Number(meta.numberMatched)
          : null;
      }
      case "arcgis": {
        const doc = await fetchJson(arcgisQueryUrl(s, layer, bbox, { returnCountOnly: "true", f: "json" }));
        return typeof doc?.count === "number" ? doc.count : null;
      }
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pages → table
// ---------------------------------------------------------------------------

const PAGE = "_gis_ws_page";
const ROWS = "_gis_ws_rows";
const OUT = "_gis_ws_out";

const DOC = "_gis_ws_doc";
const PAGE_META = `SELECT 1 AS _gis_ok, COLUMNS(lambda c: c <> 'features') FROM ${PAGE}`;

/** Download one GeoJSON page into the TEMP page table; return its metadata
 *  (every top-level member but `features`) with an `error` check. */
async function readPageMeta(url: string): Promise<Row> {
  let rows: Row[];
  try {
    rows = await download(
      `CREATE OR REPLACE TEMP TABLE ${PAGE} AS SELECT * FROM read_json('${sqlLit(duckUrl(url))}', maximum_object_size = 1073741824)`,
      PAGE_META,
    );
  } catch (e) {
    if (!/UTF-8|unicode/i.test(errMsg(e))) throw e;
    rows = await readLatin1Page(url);
  }
  const meta = rows[0] ?? {};
  if (meta.error) {
    const e = meta.error as { message?: string };
    throw new Error(`the server says: ${e.message ?? JSON.stringify(meta.error)}`);
  }
  return meta;
}

/**
 * The fallback for a page that isn't valid UTF-8, which `read_json` rejects
 * outright: older servers send their data's legacy encoding (MapServer's demo
 * mid-way through its cities). `read_csv` can decode Latin-1, which never
 * fails — the delimiter and quote are set so each line is one value, then the
 * lines are joined back into the document. The JSON is then typed the way
 * `read_json` would (`json_structure` → `from_json`), in two steps because
 * `from_json` needs its structure as a constant.
 */
async function readLatin1Page(url: string): Promise<Row[]> {
  const lines =
    `SELECT line, row_number() OVER () AS rn FROM read_csv('${sqlLit(duckUrl(url))}', encoding = 'latin-1', ` +
    `columns = {'line': 'VARCHAR'}, delim = chr(1), quote = '', escape = '', header = false, auto_detect = false)`;
  const structure = await download(
    `CREATE OR REPLACE TEMP TABLE ${DOC} AS SELECT string_agg(line, chr(10) ORDER BY rn)::JSON AS j FROM (${lines})`,
    `SELECT json_structure(j) AS s FROM ${DOC}`,
  );
  return query(
    `CREATE OR REPLACE TEMP TABLE ${PAGE} AS SELECT unnest(from_json(j, '${sqlLit(str(structure[0]?.s))}')) FROM ${DOC};
     DROP TABLE ${DOC};
     ${PAGE_META}`,
  );
}

/** Turn the page table's features into rows (properties as columns plus a
 *  `geom`) in the TEMP rows table; return how many. Properties that aren't a
 *  uniform object (missing, null, or clashing with `geom`) fall back to one
 *  JSON `properties` column. */
async function pageRows(): Promise<number> {
  const features = `FROM (SELECT unnest(features) AS f FROM ${PAGE})`;
  const geom = `ST_GeomFromGeoJSON(to_json(f.geometry)) AS geom`;
  const count = `SELECT count(*) AS n FROM ${ROWS}`;
  try {
    const rows = await query(
      `CREATE OR REPLACE TEMP TABLE ${ROWS} AS SELECT unnest(f.properties), ${geom} ${features}; ${count}`,
    );
    return Number(rows[0]?.n ?? 0);
  } catch (structError) {
    try {
      const rows = await query(
        `CREATE OR REPLACE TEMP TABLE ${ROWS} AS SELECT to_json(f.properties) AS properties, ${geom} ${features}; ${count}`,
      );
      return Number(rows[0]?.n ?? 0);
    } catch {
      // An empty `features` array has no structure to bind `f.properties` to.
      const empty = await query(`SELECT coalesce(len(features), 0) AS n FROM ${PAGE}`).catch(() => null);
      if (empty && Number(empty[0]?.n ?? -1) === 0) return 0;
      throw new Error(`couldn't read the features in the answer: ${errMsg(structError)}`);
    }
  }
}

/**
 * Download one GML page (a WFS without GeoJSON) straight into the TEMP rows
 * table through `ST_Read`; return how many features. GDAL's GML reader sorts
 * out the axis order and linearises curves; `DOWNLOAD_SCHEMA=NO` because the
 * page's schema reference (DescribeFeatureType) is fetched outside DuckDB's
 * HTTP layer and fails, leaving a GeoServer page without its geometry. There
 * are no paging metadata to read back, so the caller asks for the hit count.
 * An empty FeatureCollection opens as a dataset without layers.
 */
async function readGmlPage(url: string): Promise<number> {
  let cols: Row[];
  try {
    cols = await download(
      `CREATE OR REPLACE TEMP TABLE ${PAGE} AS SELECT * FROM ST_Read('${sqlLit(duckUrl(url))}', open_options = ['DOWNLOAD_SCHEMA=NO'])`,
      `SELECT column_name AS name, column_type AS type FROM (DESCRIBE ${PAGE})`,
    );
  } catch (e) {
    if (/contains no layers/i.test(errMsg(e))) return 0;
    throw new Error(`couldn't read the service's GML: ${errMsg(e)}`);
  }
  const geomCol = cols.find((c) => /^GEOMETRY/i.test(str(c.type)));
  if (!geomCol) throw new Error("the service's GML features have no geometry DuckDB can read");
  // GDAL's bookkeeping columns go; a property called `geom` is renamed.
  const skip = new Set(["OGC_FID", "gml_id", "lowerCorner", "upperCorner", str(geomCol.name)]);
  const select = cols
    .map((c) => str(c.name))
    .filter((n) => !skip.has(n))
    .map((n) => (n === "geom" ? `${ident(n)} AS geom_value` : ident(n)));
  select.push(`${ident(str(geomCol.name))}::GEOMETRY AS geom`);
  const rows = await query(
    `CREATE OR REPLACE TEMP TABLE ${ROWS} AS SELECT ${select.join(", ")} FROM ${PAGE};
     SELECT count(*) AS n FROM ${ROWS}`,
  );
  return Number(rows[0]?.n ?? 0);
}

interface FetchResult {
  fetched: number;
  /** The service's total for the request, when known. */
  total: number | null;
  capped: boolean;
}

/** Called after each page: features so far, and the service's total when it
 *  has said. A slow service can take tens of seconds per page. */
export type FetchProgress = (fetched: number, total: number | null) => void;

/**
 * Fetch `layer`'s features (within `bbox`, or all when null), up to `cap`,
 * into `memory.main.<table>`, replacing what's there. Pages collect in a TEMP
 * table and land in one statement at the end, so the target is never half
 * written. Writes nothing when no features came back.
 */
async function fetchInto(
  table: string,
  s: Service,
  layer: string,
  bbox: Bbox | null,
  cap: number,
  onProgress?: FetchProgress,
): Promise<FetchResult> {
  const target = `${ident(WORKING_CATALOG)}.main.${ident(table)}`;
  // A WFS that can't page gets one request for everything up to the cap.
  const unpaged = s.type === "wfs" && !s.paging;
  let limit = unpaged ? cap : Math.min(pageSize(s), cap);
  let url: string | null = pageUrl(s, layer, bbox, 0, limit);
  let fetched = 0;
  let offset = 0;
  // GML pages carry no metadata we can read, so the hit count comes first: it
  // drives paging and tells an empty answer from one that didn't parse.
  let total: number | null = s.gml ? await countFeatures(s, layer, bbox) : null;
  let fullPage = false;
  try {
    while (url && fetched < cap) {
      const meta = s.gml ? { numberMatched: total } : await readPageMeta(url);
      const returned = s.gml ? await readGmlPage(url) : await pageRows();
      if (total == null && (typeof meta.numberMatched === "number" || typeof meta.numberMatched === "bigint")) {
        total = Number(meta.numberMatched);
      }
      if (returned === 0) {
        // GDAL stops at bytes that aren't valid UTF-8 without failing.
        if (s.gml && total != null && total > offset) {
          throw new Error(
            `couldn't read the service's GML past feature ${offset.toLocaleString()} of ${total.toLocaleString()}`,
          );
        }
        break;
      }
      const take = Math.min(returned, cap - fetched);
      await query(
        fetched === 0
          ? `CREATE OR REPLACE TEMP TABLE ${OUT} AS SELECT * FROM ${ROWS} LIMIT ${take}`
          : `CREATE OR REPLACE TEMP TABLE ${OUT} AS SELECT * FROM ${OUT} UNION ALL BY NAME (SELECT * FROM ${ROWS} LIMIT ${take})`,
      );
      fetched += take;
      offset += returned;
      onProgress?.(fetched, total);
      fullPage = returned >= limit;
      limit = Math.min(pageSize(s), cap - fetched);
      // At the cap, leave `url` set: whether more exists is settled below.
      if (limit > 0) url = nextPageUrl(s, layer, bbox, meta, offset, !fullPage, limit);
    }
    if (fetched > 0) {
      if (bbox) await fixAxisOrder(bbox);
      await query(`CREATE OR REPLACE TABLE ${target} AS SELECT * FROM ${OUT}`);
    }
    // An unpaged WFS that filled its one request probably has more.
    let capped =
      fetched >= cap && (url != null || (total != null && total > fetched) || (unpaged && fullPage));
    if (capped && total == null) {
      total = await countFeatures(s, layer, bbox);
      if (total != null && total <= fetched) capped = false;
    }
    return { fetched, total, capped };
  } finally {
    await query(
      [OUT, ROWS, PAGE, DOC].map((t) => `DROP TABLE IF EXISTS ${t}`).join("; "),
    ).catch(() => {});
  }
}

/** Flip lat/lon-ordered results (see header): none of the features meets the
 *  requested bbox, but some do once their coordinates are swapped. */
async function fixAxisOrder([w, s, e, n]: Bbox): Promise<void> {
  const env = `ST_MakeEnvelope(${w}, ${s}, ${e}, ${n})`;
  const rows = await query(
    `SELECT count(*) FILTER (WHERE ST_Intersects(geom, ${env})) AS inside,
            count(*) FILTER (WHERE ST_Intersects(ST_FlipCoordinates(geom), ${env})) AS flipped
       FROM ${OUT}`,
  );
  if (Number(rows[0]?.inside ?? 0) === 0 && Number(rows[0]?.flipped ?? 0) > 0) {
    await query(`UPDATE ${OUT} SET geom = ST_FlipCoordinates(geom)`);
  }
}

// One fetch at a time: they share the TEMP page/rows/out tables on the session
// connection.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------------------
// Service-backed layers
// ---------------------------------------------------------------------------

export interface ServiceLayerState {
  service: Service;
  layer: ServiceLayer;
  table: string;
  /** What the table holds: the features in a view's bbox, or the whole layer. */
  scope: "view" | "all";
  fetched: number;
  total: number | null;
  capped: boolean;
  busy: boolean;
}

/** What a project file keeps of a layer's service state (#121), so its menu
 *  can still refresh or download it after the project is reopened. */
export type SavedServiceLayer = Omit<ServiceLayerState, "busy">;

const byLayer = new Map<string, ServiceLayerState>();
const signal = changeSignal();

function update(id: string, changes: Partial<ServiceLayerState>): void {
  const state = byLayer.get(id);
  if (!state) return;
  byLayer.set(id, { ...state, ...changes });
  signal.emit();
}

const sourceFor = (table: string): LayerSource => ({
  db: WORKING_CATALOG,
  schema: "main",
  table,
  geomColumn: "geom",
});

async function refetch(id: string, bbox: Bbox | null, cap: number): Promise<void> {
  const state = byLayer.get(id);
  if (!state || state.busy) return;
  update(id, { busy: true, fetched: 0, total: null });
  try {
    const r = await serial(() =>
      fetchInto(state.table, state.service, state.layer.id, bbox, cap, (fetched, total) =>
        update(id, { fetched, total }),
      ),
    );
    if (r.fetched === 0) {
      // Keep the columns, drop the rows: the layer stays, empty for this view.
      const target = `${ident(WORKING_CATALOG)}.main.${ident(state.table)}`;
      await query(`DELETE FROM ${target}`);
    }
    unsavedChanges.markDirty();
    update(id, { scope: bbox ? "view" : "all", fetched: r.fetched, total: r.total, capped: r.capped });
    await layers.refresh(id);
  } finally {
    update(id, { busy: false });
  }
}

export const webServices = {
  connect,

  /** The service behind a layer, if it was added from one this session. */
  get(id: string): ServiceLayerState | undefined {
    if (!layers.get(id)) byLayer.delete(id); // the layer was removed
    return byLayer.get(id);
  },
  get version(): number {
    return signal.version;
  },
  subscribe: signal.subscribe,

  /** A layer's service state for a project file, if it came from a service. */
  snapshot(id: string): SavedServiceLayer | undefined {
    const state = webServices.get(id);
    if (!state) return undefined;
    const { busy: _busy, ...saved } = state;
    return saved;
  },

  /** Re-link a layer reopened from a project file to its service (state that
   *  `snapshot` wrote; anything else is ignored). */
  restore(id: string, saved: unknown): void {
    const s = saved as SavedServiceLayer | null;
    if (!s?.service?.url || !s.layer?.id || !s.table || !layers.get(id)) return;
    byLayer.set(id, { ...s, busy: false });
    signal.emit();
  },

  /** Fetch `layer`'s features in the current map view into a new working
   *  table and add it as a layer. Throws when the view holds none. */
  async addLayer(service: Service, layer: ServiceLayer, onProgress?: FetchProgress): Promise<void> {
    const bbox = viewBbox();
    const table = await freeTableName(layer.title || layer.id);
    const r = await serial(() => fetchInto(table, service, layer.id, bbox, VIEW_CAP, onProgress));
    if (r.fetched === 0) {
      throw new Error(
        bbox
          ? "No features in the current map view — pan or zoom to where this layer has data, then add it again."
          : "The layer has no features.",
      );
    }
    unsavedChanges.markDirty(); // a new working-catalog table (#67)
    const source = sourceFor(table);
    byLayer.set(layerId(source), {
      service,
      layer,
      table,
      scope: bbox ? "view" : "all",
      fetched: r.fetched,
      total: r.total,
      capped: r.capped,
      busy: false,
    });
    signal.emit();
    await layers.add(source);
  },

  /** Replace a layer's features with those in the current map view. */
  refreshForView(id: string): Promise<void> {
    return refetch(id, viewBbox(), VIEW_CAP);
  },

  /** How many features the whole layer has, or null when the service won't say. */
  countAll(id: string): Promise<number | null> {
    const state = byLayer.get(id);
    return state ? countFeatures(state.service, state.layer.id, null) : Promise.resolve(null);
  },

  /** Replace a layer's features with the whole layer, up to DOWNLOAD_CAP. */
  downloadAll(id: string): Promise<void> {
    return refetch(id, null, DOWNLOAD_CAP);
  },
};
