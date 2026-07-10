// ---------------------------------------------------------------------------
// Map feature selection set (T-003).
//
// A picked feature must resolve back to a concrete source row so downstream
// geoprocessing tools (T-004) can build SQL against exactly the selected
// features. The render path (`deckRender`) runs *arbitrary user SQL* — the
// result may be a synthetic `UNION ALL`, a join, or any expression with no
// single backing table — so a db.schema.table + primary-key identifier is not
// generally available. The strategy that *is* general:
//
//   • Record the **source SQL** of the current render (`sourceSql`).
//   • Tag every rendered feature with a deterministic per-render id `__fid`
//     (`row_number()`), produced by ONE shared relation builder
//     (`fidTaggedRelation`) used both by the render encode and by any
//     downstream tool. Because both derive `__fid` from the same source query
//     the same way, a picked fid maps back to the same row a tool would see.
//
// So a selection is (sourceSql, {fid, …}). A tool reconstructs the rows with
//   SELECT * FROM (<fidTaggedRelation(sourceSql)>) WHERE __fid IN (<fids>)
//
// Caveat: `row_number() OVER ()` is positional, not a stable primary key — it
// is only guaranteed to line up for re-evaluations of the *same* source query.
// That is sufficient for an interactive selection → tool round-trip. When the
// Layers panel makes layers table-backed (T-002/T-010) we can upgrade `__fid`
// to a real rowid/PK; keeping the id behind this module localises that change.
// ---------------------------------------------------------------------------

/** Column name carrying the per-render stable feature id. */
export const FID = "__fid";

/**
 * Wrap a source query so every surviving feature carries a deterministic
 * `__fid`. Mirrors the filtering `deckRender` applies before rendering
 * (`geom IS NOT NULL`) so fids assigned here match the ones the map renders.
 */
export function fidTaggedRelation(sourceSql: string): string {
  const inner = sourceSql.trim().replace(/;\s*$/, "");
  return `SELECT *, row_number() OVER () AS ${FID} FROM (${inner}) _q WHERE geom IS NOT NULL`;
}

type Listener = () => void;

const selected = new Set<number>();
let sourceSql = "";
let version = 0;
const listeners = new Set<Listener>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export const selection = {
  has: (fid: number): boolean => selected.has(fid),
  get size(): number {
    return selected.size;
  },
  fids: (): number[] => [...selected],
  /** Bump on every mutation; use as a deck.gl `updateTriggers` value. */
  get version(): number {
    return version;
  },

  toggle(fid: number): void {
    if (selected.has(fid)) selected.delete(fid);
    else selected.add(fid);
    emit();
  },
  set(fids: number[]): void {
    selected.clear();
    for (const f of fids) selected.add(f);
    emit();
  },
  clear(): void {
    if (selected.size === 0) return;
    selected.clear();
    emit();
  },

  /**
   * Record the source query for the current render and reset the selection —
   * fids are only meaningful within the render they came from.
   */
  setSource(sql: string): void {
    sourceSql = sql.trim().replace(/;\s*$/, "");
    selected.clear();
    emit();
  },
  source: (): string => sourceSql,

  /**
   * The current selection as a source query + fids, or `null` when nothing is
   * selected. A tool feeds `sql` through {@link fidTaggedRelation} and filters
   * on `${FID} IN (…fids)` to operate on exactly the selected features.
   */
  query(): { sql: string; fids: number[] } | null {
    if (selected.size === 0 || !sourceSql) return null;
    return { sql: sourceSql, fids: [...selected] };
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export type Selection = typeof selection;
