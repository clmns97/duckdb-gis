// ---------------------------------------------------------------------------
// Attached DuckDB database files (T-007).
//
// The first "Add data source" flow: `ATTACH '<path>' AS <alias>` an external
// DuckDB file so its schemas/tables surface in the Browser catalog next to the
// default database. `loadCatalog()` already picks up any non-internal database,
// so attaching + refreshing the catalog is all the Browser tree needs.
//
// The path is **server-side** — DuckDB runs in-process in the extension, so it
// opens files on the extension host's filesystem, not the browser's. A real
// file picker would need a server-side browse endpoint; v1 takes a typed path
// (noted on the ticket). Object storage (T-008) and Postgres (T-009) reuse this
// same entry point with different ATTACH targets.
//
// Always read-only (#66, ADR-0002) — unconditionally, not a default a caller
// can opt out of. A source becomes writable only for the span of an explicit
// edit session on one of its tables (`workspace.ts` acquireWriteLock/
// releaseWriteLock), never as a standing attach-time choice.
//
// This module tracks the aliases *we* attached this session (a subscribable
// store mirroring `layers`/`selection`) so the Browser can offer "Detach" only
// on those nodes — never on the default/in-memory database.
// ---------------------------------------------------------------------------

import { query, sqlLit } from "./duckdb";

type Listener = () => void;

const attachedAliases = new Set<string>();
let version = 0;
const listeners = new Set<Listener>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Quote an identifier for SQL (alias). */
function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Derive a default alias from a file path: the basename without its extension,
 * with anything that isn't a word char collapsed to `_`. The alias is the
 * database name shown in the catalog and used to `DETACH`, so keeping it a
 * plain identifier avoids surprises. Empty/degenerate names fall back to `db`.
 */
export function aliasFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.[^.]+$/, "");
  const cleaned = stem.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "db";
}

export const attach = {
  /** Aliases attached this session, in insertion order. */
  list: (): string[] => [...attachedAliases],
  has: (alias: string): boolean => attachedAliases.has(alias),
  /** Scalar snapshot for `useSyncExternalStore`. */
  get version(): number {
    return version;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /**
   * Attach a DuckDB database file, always read-only (#66 — the default DB and
   * any attached file are untouched by exploration; only an explicit edit
   * session lifts that, per source, for its duration). `alias` defaults to
   * {@link aliasFromPath}. Throws with DuckDB's message on failure (missing
   * file, bad path, alias collision) so the caller can surface it. On success
   * records the alias; the caller refreshes the catalog to reveal the new tree.
   */
  async run(opts: { path: string; alias?: string }): Promise<string> {
    const path = opts.path.trim();
    if (!path) throw new Error("Enter a database file path.");
    const alias = (opts.alias?.trim() || aliasFromPath(path));

    await query(`ATTACH '${sqlLit(path)}' AS ${ident(alias)} (READ_ONLY)`);

    attachedAliases.add(alias);
    emit();
    return alias;
  },

  /** Detach a previously attached database. Drops it from the catalog on the
   *  next refresh. No-op tracking-wise if the alias is unknown, but still issues
   *  the DETACH so a manually-attached db can be dropped too. */
  async detach(alias: string): Promise<void> {
    await query(`DETACH ${ident(alias)}`);
    attachedAliases.delete(alias);
    emit();
  },
};

export type Attach = typeof attach;
