// ---------------------------------------------------------------------------
// HTTP through DuckDB, for the web-service clients (webServices.ts — feature
// services, #121; rasterServices.ts — WMS/WMTS, #122): requests go out through
// DuckDB's httpfs, so a service needs no CORS headers, plus the URL and
// namespace-agnostic XML helpers their capabilities parsing shares.
// ---------------------------------------------------------------------------

import { query, str, sqlLit, type Row } from "./duckdb";
import { ensureHttpfs } from "./remote";

export const duckUrl = (url: string): string => url.replace(/\*/g, "%2A");

// Commas and colons stay literal: BBOX values and CRS URNs go out the way
// servers document them.
const enc = (v: string): string =>
  encodeURIComponent(v).replace(/%2C/gi, ",").replace(/%3A/gi, ":");

export function splitUrl(url: string): [string, string[]] {
  const q = url.indexOf("?");
  if (q === -1) return [url, []];
  return [url.slice(0, q), url.slice(q + 1).split("&").filter(Boolean)];
}

/** `url` with `params` set, replacing same-named ones (case-insensitive — a
 *  pasted GetCapabilities URL's REQUEST, say) and keeping the rest of its
 *  query (MapServer's `map=`, an access token). */
export function withParams(url: string, params: Record<string, string | number>): string {
  const [base, pairs] = splitUrl(url);
  const names = new Set(Object.keys(params).map((k) => k.toLowerCase()));
  const kept = pairs.filter((kv) => !names.has(kv.split("=")[0].toLowerCase()));
  const added = Object.entries(params).map(([k, v]) => `${k}=${enc(String(v))}`);
  return `${base}?${[...kept, ...added].join("&")}`;
}

/** `url` without the named query params (case-insensitive). */
export function withoutParams(url: string, names: string[]): string {
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
export async function download(statements: string, final: string): Promise<Row[]> {
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

export async function fetchText(url: string): Promise<string> {
  const rows = await download(
    `CREATE OR REPLACE TEMP TABLE _gis_ws_text AS SELECT content FROM read_text('${sqlLit(duckUrl(url))}')`,
    `SELECT content FROM _gis_ws_text`,
  );
  await query("DROP TABLE IF EXISTS _gis_ws_text"); // or the Browser shows a temp schema
  return str(rows[0]?.content);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchJson(url: string): Promise<any> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} did not answer with JSON`);
  }
}

// Namespace-agnostic XML helpers: WFS 1.1 and 2.0 put the same elements in
// different namespaces (wfs/ows 1.0/ows 1.1).
export const descendants = (el: Element, name: string): Element[] =>
  Array.from(el.getElementsByTagNameNS("*", name));
export const children = (el: Element | undefined, name: string): Element[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];
export const child = (el: Element | undefined, name: string): Element | undefined => children(el, name)[0];
export const childText = (el: Element | undefined, name: string): string =>
  child(el, name)?.textContent?.trim() ?? "";

/** Parse a capabilities document, turning a service exception into its message. */
export function parseCapabilities(xml: string, roots: string[], what: string): Element {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("the GetCapabilities answer isn't XML");
  }
  const root = doc.documentElement;
  if (/Exception(Report)?$/.test(root.localName)) {
    throw new Error(`the server says: ${root.textContent?.trim().slice(0, 300)}`);
  }
  if (!roots.includes(root.localName)) throw new Error(`not a ${what} GetCapabilities document`);
  return root;
}
