---
id: T-041
title: Select features from added layers (not just the SQL Run preview)
status: done
priority: P1
area: frontend
depends_on: [T-003, T-004]
branch: t-041-select-features-from-added-layers
---

## Goal

Let the user click features on **any** layer on the map — catalog tables,
Overture quick-load, merge results — and hold them as a selection, exactly like
the SQL-editor Run preview already allows. Today only the Run-preview slot is
selectable; every persistent "added" layer is invisible to picking. Selection is
scoped to **one active layer at a time** (clicking a feature in a different layer
resets the selection to it), which keeps the selection single-source so the
existing Merge tool keeps working. Cross-layer multi-select is a deliberate
follow-up.

## Context

<context>
Root cause is the two render paths in `frontend/src/lib/deckRender.ts`:

  - The SQL-editor Run preview (`rendered`) is built by the `POINT`/`PATH`/
    `POLYGON` factories: `pickable: true`, carries a `__fid` column, selection-
    aware colour accessors (`colorAcc`/`numAcc`, `updateTriggers: hiTriggers()`).
    This is why selection works there.
  - Persistent added layers (`added` map, `addDeckLayer`) are built by the
    `*_STATIC` factories: `pickable: false`, **no `__fid` column** (the encoded
    query is `SELECT <fn>(geom) AS geom …` with no fid), no selection accessors.
    So they can't be picked at all.

The selection store (`frontend/src/lib/selection.ts`) models a single
`sourceSql` + `Set<fid>`. `selection.query()` → `{sql, fids}` feeds geoprocessing
(`frontend/src/lib/geoprocessing.ts:36` — `fidTaggedRelation(sel.sql)` +
`WHERE __fid IN (…)`). To pick from an added layer, the store must learn *which*
source SQL a pick came from so the fids line up when a tool rebuilds the rows.

`pickFid` (`deckRender.ts:148`) currently only resolves fids for the Run-preview
(`geoarrow-<i>` layer ids / cached `rendered.table`). Added-layer ids are
`added-<id>-<i>`. `handleClick` (`deckRender.ts:176`) drives select/toggle/clear.

Added-layer inner source SQL is built in `frontend/src/lib/layers.ts`
(`SELECT <geomCol> AS geom FROM <qualified>` in `add`, arbitrary `sql` in
`addQuery`). `addDeckLayer(id, sourceSql)` gets that inner SQL — store it on the
`AddedLayer` so a pick can record it as the selection source.

Design decision (this ticket): **single active layer**. `selection` gains a
`pick(source, fid, additive)` gesture: additive within the current source
toggles; a pick from a different source resets the source and selects just that
fid. `selection.query()` stays single-source; geoprocessing unchanged.

Gotchas from T-003 to preserve: box-zoom is disabled so shift-click isn't
swallowed (`MapView`); the Shift modifier is tracked via document keydown/keyup
(`shiftHeld`) because mjolnir's click event drops it; while editing, `editGate`
lets Terra Draw own the click.
</context>

## Acceptance criteria

- [ ] Clicking a feature on a catalog/Overture/merge layer selects it and
      highlights it (amber), same as the Run preview.
- [ ] Shift-click adds/removes within the active layer; clicking a feature in a
      different layer switches the active layer and selects just that feature;
      clicking empty map clears.
- [ ] Added layers carry `__fid` and are `pickable`; picked fids resolve back to
      source rows via the same `fidTaggedRelation` path (Merge still works on a
      selection made from an added layer).
- [ ] Frontend build + typecheck pass.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-19: Ticket created from investigation. Root cause + single-active-layer
  design decided.
- 2026-07-19: Implemented. Changes:
  - `lib/selection.ts`: new `pick(source, fid, additive)` — additive toggles
    within the active source; a pick from a different source switches the active
    layer and selects just that fid (fids from different layers share a `__fid`
    space starting at 1, so this stops collisions).
  - `lib/deckRender.ts`: highlight accessors (`colorAcc`/`numAcc`) now take a
    `source` and highlight only when `selection.source() === source` (guards the
    fid-collision case). Static added-layer factories are now `pickable: true`
    and selection-aware (amber over the layer's base style). `AddedLayer` and
    `rendered` record their inner `source`. `addDeckLayer` tags added-layer
    geometry with `__fid` via `fidTaggedRelation` (same as the Run preview).
    `pickFid` → `resolvePick` returns `{fid, source}`, resolving `added-<id>-<i>`
    layer ids too; `handleClick` calls `selection.pick(...)`.
  - `selection.query()` stays single-source, so `geoprocessing` Merge is
    unchanged and now works on a selection made from an added layer.
  - Verified: frontend typecheck + build pass; the `__fid`-tagged encode SQL runs
    clean against DuckDB (no little-endian WKB error). Interactive click-select
    on the map still to be eyeballed in a preview.
  Next: eyeball click-selection on a catalog/Overture layer in the running app.
- 2026-07-19: Confirmed working in the preview — clicking features on an added
  layer highlights them. Branch was originally cut off `main` (old toolbar);
  fast-forwarded onto `t-040-ui-kit-design-system` so the QGIS toolbar and this
  fix ship together. Merged to `main`; ticket done.
