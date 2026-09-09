// ---------------------------------------------------------------------------
// Working catalog + edit-session write lock (#66; supersedes ADR-0001's
// blanket "attached sources are read-only forever" — see ADR-0002).
//
// The model is QGIS's, not GeoLibre's: a source attaches read-only (default,
// enforced — attach.ts no longer offers a writable option), and stays that way
// except for the span of an explicit edit session on one of its tables. Toggling
// editing promotes the source's whole catalog to writable; Save/Cancel demotes
// it back. Outside a session DuckDB itself rejects writes (the attach mode *is*
// the guard) — nothing else has to check permission.
//
// Two independent jobs live here:
//   • ensureWorkingCatalog() — guarantee a `memory` catalog exists and is
//     current. On the normal `duckdb -ui` launch this is already true and a
//     no-op. Launched as `duckdb file.db -ui`, DuckDB has no `memory` catalog
//     at all and `file.db` is the default, writable one — verified against
//     1.5.4. Forcing `memory` to exist and be current means scratch/new-layer
//     tables always land in the ephemeral working set, never in the launch
//     file, regardless of launch shape.
//   • acquireWriteLock()/releaseWriteLock() — promote/demote one attached
//     catalog by DETACH + re-ATTACH under the same alias. Verified against
//     1.5.4: the alias identity survives the round-trip, so every layer's
//     `db.schema.table` reference keeps resolving across the swap. A DETACH
//     that fails to re-ATTACH read-only leaves the source writable rather than
//     losing the catalog entirely — see the comment on releaseWriteLock.
// ---------------------------------------------------------------------------

import { query, str, sqlLit, errMsg } from "./duckdb";
import { ident, type LayerSource } from "./layers";

/** The ephemeral in-memory catalog scratch/new-from-draw layers live in. */
export const WORKING_CATALOG = "memory";

let ensuring: Promise<void> | null = null;

/**
 * Idempotent; safe to call from every mount. Attaches `:memory:` as `memory`
 * only when it doesn't already exist (the normal launch path already has it),
 * then makes it current so unqualified/default-catalog writes are predictable
 * regardless of how DuckDB was launched.
 *
 * Races two callers concurrently checking-then-attaching would otherwise both
 * see "doesn't exist yet" and both issue the ATTACH, and the loser throws
 * "already exists" — App.tsx's effect runs twice per mount under React
 * StrictMode in dev, which hits exactly this. Guarded two ways: same-tab
 * callers share one in-flight promise; a genuinely separate session racing
 * us (e.g. two tabs against the same backend) is caught and treated as
 * success if the catalog exists by the time we look again.
 */
export function ensureWorkingCatalog(): Promise<void> {
  if (!ensuring) {
    ensuring = (async () => {
      const rows = await query(
        `SELECT 1 AS x FROM duckdb_databases() WHERE database_name = '${sqlLit(WORKING_CATALOG)}'`,
      );
      if (rows.length === 0) {
        try {
          await query(`ATTACH ':memory:' AS ${ident(WORKING_CATALOG)}`);
        } catch (e) {
          const exists = await query(
            `SELECT 1 AS x FROM duckdb_databases() WHERE database_name = '${sqlLit(WORKING_CATALOG)}'`,
          );
          if (exists.length === 0) throw e;
        }
      }
      await query(`USE ${ident(WORKING_CATALOG)}`);
    })();
  }
  return ensuring;
}

// Catalogs this session has promoted to writable, keyed by alias, so release
// knows the on-disk path to re-attach and won't double-DETACH. At most one
// entry in practice (the editing store only ever has one active target), but
// keyed rather than a single slot in case that ever changes.
const held = new Map<string, { path: string }>();

/**
 * Promote `source`'s catalog to writable for the duration of an edit session.
 * No-op for the working catalog (already writable) and for a source that
 * turns out not to be read-only (e.g. the database DuckDB was launched with —
 * never routed through our read-only attach, so it's outside this gate).
 * Throws readably if the DETACH/re-ATTACH fails (most likely: another process
 * holds a conflicting lock on the file) — the caller (editing.beginEdit) is
 * expected to surface that before any work is invested.
 */
export async function acquireWriteLock(source: LayerSource): Promise<void> {
  const alias = source.db;
  if (alias === WORKING_CATALOG || held.has(alias)) return;

  const rows = await query(
    `SELECT readonly, path FROM duckdb_databases() WHERE database_name = '${sqlLit(alias)}'`,
  );
  if (rows.length === 0) throw new Error(`"${alias}" is not attached.`);
  if (!rows[0].readonly) return; // not one of our read-only-gated sources
  const path = str(rows[0].path);

  try {
    await query(`DETACH ${ident(alias)}`);
    await query(`ATTACH '${sqlLit(path)}' AS ${ident(alias)}`);
  } catch (e) {
    // Best-effort: put it back exactly as it was rather than leaving the
    // catalog detached and every layer on it broken.
    try {
      await query(`ATTACH '${sqlLit(path)}' AS ${ident(alias)} (READ_ONLY)`);
    } catch {
      // Nothing more we can do; surface the original error below.
    }
    throw new Error(`Could not open "${alias}" for editing: ${errMsg(e)}`);
  }
  held.set(alias, { path });
}

/**
 * Demote `source`'s catalog back to read-only after an edit session ends
 * (Save or Cancel). No-op if nothing is held for it (working catalog, or a
 * source `acquireWriteLock` skipped). Throws if the re-attach-read-only step
 * fails — the source is left writable in that case, which the caller should
 * tell the user about, but the local edit-mode teardown must already be done
 * by the time this is called (see editing.ts `finishEdit`).
 */
export async function releaseWriteLock(source: LayerSource): Promise<void> {
  const alias = source.db;
  const info = held.get(alias);
  if (!info) return;
  held.delete(alias);
  try {
    await query(`DETACH ${ident(alias)}`);
    await query(`ATTACH '${sqlLit(info.path)}' AS ${ident(alias)} (READ_ONLY)`);
  } catch (e) {
    throw new Error(`Saved, but could not restore "${alias}" to read-only: ${errMsg(e)}`);
  }
}
