// ---------------------------------------------------------------------------
// Geoprocessing tools (T-004).
//
// A small registry drives the top-bar Processing menu: adding a tool is adding
// one entry, not editing menu JSX. Each tool declares whether it's `enabled`
// for the current app state and a `run` that does the work. This is the seed of
// the QGIS-style geoprocessing framework — later tools (Dissolve, Buffer,
// Difference, …) are more entries here, running as native DuckDB `spatial` SQL.
//
// The first tool is **Merge**: union the selected features' geometries into one
// (`ST_Union_Agg`) and surface the result as a new layer. It builds SQL from the
// selection the same way the map render does — via `fidTaggedRelation` over the
// recorded source SQL — so the fids line up (see `lib/selection.ts`).
// ---------------------------------------------------------------------------

import { selection, fidTaggedRelation, FID } from "./selection";
import { layers } from "./layers";
import { errMsg } from "./duckdb";
import type { MenuItem } from "../components/ContextMenu";

export interface GeoTool {
  id: string;
  label: string;
  /** Whether the tool can run against the current app state. */
  enabled: () => boolean;
  /** Hint shown when disabled (why it can't run yet). */
  disabledHint?: string;
  /** Run the tool. Rejects with a readable Error on failure. */
  run: () => Promise<void>;
}

// Monotonic within a session so successive merges get distinct layer ids/names.
let mergeTick = 0;

async function runMerge(): Promise<void> {
  const sel = selection.query();
  if (!sel || sel.fids.length < 2) {
    throw new Error("Select at least two features on the map before merging.");
  }
  const n = ++mergeTick;
  const rel = fidTaggedRelation(sel.sql);
  const fidList = sel.fids.join(", ");
  const merged =
    `SELECT ST_Union_Agg(geom) AS geom ` +
    `FROM (${rel}) ` +
    `WHERE ${FID} IN (${fidList})`;
  // Render-only first cut: pass the geometry query straight to the layers store
  // (it projects `geom`, so no CREATE TABLE is needed). Persisting the result as
  // a table is a deferred follow-up (see T-004 / the editing.commit pattern).
  await layers.addQuery({
    id: `merge_result_${n}`,
    name: `Merge result ${n}`,
    sql: merged,
  });
}

export const TOOLS: GeoTool[] = [
  {
    id: "merge",
    label: "Merge selected features",
    enabled: () => selection.size >= 2,
    disabledHint: "Select at least two features on the map",
    run: runMerge,
  },
];

/** The Processing menu's items, built from the tool registry (parallels
 *  `basemapMenuItems`). A disabled tool shows why it can't run; `run()` errors
 *  are routed to `onError`. */
export function toolMenuItems(onError: (message: string) => void): MenuItem[] {
  return TOOLS.map((tool) => {
    const enabled = tool.enabled();
    return {
      label: enabled || !tool.disabledHint ? tool.label : `${tool.label} (${tool.disabledHint})`,
      disabled: !enabled,
      onSelect: () => {
        tool.run().catch((err) => onError(errMsg(err)));
      },
    };
  });
}
