---
id: T-038
title: Show the digitizing toolbar only in edit mode (edit a layer / new layer)
status: in-progress
priority: P2
area: frontend
depends_on: [T-025]
branch: t-038-digitizing-toolbar-edit-mode-only
---

## Goal

The digitizing toolbar is not on-screen by default. It appears only when the user
explicitly enters edit mode — either by toggling editing on an existing layer or
by creating a new layer — and it is bound to that one layer. A layer holds a
single geometry family (points, or lines, or polygons — not a mix). On commit,
edits go back into the layer being edited (edit-in-place for existing layers, or
into the new layer's table), not into a fresh anonymous `scratch_N` every time.
"Done" means: the map is clean until you choose to edit, editing is scoped to one
chosen layer, and geometry is never mixed within a layer.

## Context

<context>
Built on T-025 (draw + vertex edit + commit, done). What T-025 shipped, and why
it now feels wrong:
- The toolbar `DrawToolbar` is **mounted permanently** in the map
  (`components/panels/MapPanel.tsx:5,32` renders `<DrawToolbar/>` unconditionally;
  the store is `lib/editing.ts`). So digitizing controls are always visible.
- `editing.commit()` writes to a **new** `main.scratch_<n>` table each time
  (T-025 progress log) and splits the working set by geometry family into
  separate layers. There is **no way to target/edit an existing layer**, and a
  single commit can produce mixed geometries.
- The toolbar offers Point/Line/Polygon simultaneously, encouraging mixing
  geometries in one working set (`components/DrawToolbar.tsx:10-15`).

**Decisions (from the user):**
1. **Two entry points into edit mode:**
   - Layer context menu → **"Toggle editing"** (`LayersPanel.tsx:61-90`
     `openLayerMenu` — add the item), QGIS-style, entering edit mode bound to
     that layer.
   - A top-level **"New layer"** command that prompts for a name + one geometry
     type, creates an empty layer, and enters edit mode on it.
   When not editing, the toolbar is hidden entirely.
2. **Edit-in-place of existing layers is in scope.** Existing layers render via
   the read-only GeoArrow→deck.gl path (`lib/deckRender.ts`), which is *not*
   editable. So entering edit mode on an existing layer must load its features
   into the editable **MapLibre working set** (Terra Draw / GeoJSON) — e.g.
   `SELECT __fid, ST_AsGeoJSON(<geom>) FROM <source>` — let the user edit
   vertices, then **commit back to that layer's table** (UPDATE/INSERT/DELETE
   keyed on the existing `__fid` scheme from T-025/T-003, not a new table).
   Watch performance on large layers — consider a guard (extent/row-count cap, or
   "edit selected features only") so we don't pull a whole heavy layer into
   GeoJSON; a first cut can restrict edit-in-place to reasonably small layers and
   surface a clear message otherwise.
3. **One geometry family per layer.** A layer being edited constrains the
   toolbar to its own geometry type (a polygon layer only draws polygons). A new
   layer's type is chosen at creation. No mixed-geometry commits.

**Implementation notes (not binding):**
- Add editing lifecycle to `lib/editing.ts`: `beginEdit(layer)` /
  `beginNewLayer({name, geometryKind})` / `finishEdit()`, exposing an "active
  edit target" and the allowed geometry mode(s). `DrawToolbar` renders only when
  a target is active and offers only the target's geometry mode + Select/Delete +
  Commit/Cancel.
- Gate `<DrawToolbar/>` mount on `editing.isEditing()` (or an "edit target"
  snapshot) instead of always-on.
- Commit paths diverge: **new layer** → create the table once (T-025's
  `ST_GeomFromGeoJSON` path, single geometry column); **existing layer** →
  UPDATE/INSERT/DELETE by `__fid`, then re-render through the normal GeoArrow
  path (`layers.addQuery` / re-`add`).
- Coordinate the geometry-family concept with **T-039** (which also needs a
  per-layer geometry kind for its symbology glyph) — resolve it once and share.
- A "Cancel/Stop editing" affordance should discard the working set without
  committing.
</context>

## Acceptance criteria

- [x] The digitizing toolbar is hidden by default; the map has no editing UI until
      edit mode is entered. (Now a compact top-left **Edit** button that expands
      into the full bar on entering edit mode.)
- [x] Layer context menu offers "Toggle editing"; entering it binds the toolbar to
      that layer and constrains drawing to the layer's geometry family.
- [x] A "New layer" command prompts for name + geometry type, creates an empty
      single-geometry layer, and enters edit mode on it.
- [x] Editing an existing layer loads its features editable, and Commit writes the
      edits back to that layer's table (not a new `scratch_N`), re-rendered
      through the normal GeoArrow path. Large-layer behavior is guarded/messaged.
- [x] A single layer never ends up with mixed geometry types via this flow.
- [x] "Stop editing"/Cancel discards the working set without committing.
- [~] `pnpm --dir frontend typecheck` and `build` pass (done); exercised in the
      preview — new-layer create+draw+commit and edit-in-place of a small layer —
      still pending an interactive eyeball.

## Progress log

- 2026-07-16: Opened from user feedback that the always-on toolbar "breathes a new
  layer every time" with no way to edit an existing one. Decisions captured: two
  entry points (context-menu "Toggle editing" + top-level "New layer"), edit-in-place
  IS in scope (load existing layer into the MapLibre working set, commit back by
  `__fid`), one geometry family per layer, toolbar hidden unless a layer is being
  edited. Depends on T-025 (the Terra Draw working set + commit path already exist).
  Coordinate geometry-kind with T-039.
- 2026-07-19: Implemented in one pass, framed as the user's "differentiate layer/
  processing vs. feature editing" split. Key point: the toolbar's old "Select"
  operated on the Terra Draw working set only, so rendered-layer features (read-
  only GeoArrow) couldn't be vertex-edited — the fix is to load them into the
  working set on entering edit mode.
  - `lib/editing.ts`: reworked around an explicit **edit target** (`kind: new |
    existing`). `beginNewLayer({name, geometryKind})`, `beginEdit(layer)` (loads
    features via `SELECT rowid, ST_AsGeoJSON(geom)`, capped at 2000, keyed by
    rowid; hides the read-only deck copy while editing), `finishEdit()` (cancel/
    teardown, restores the deck copy). `setMode` clamped to Select + the target's
    one draw mode. `commit()` diverges: new → `CREATE TABLE main.<name>` +
    `layers.add(...)`; existing → UPDATE/INSERT/DELETE by rowid in a transaction,
    then `layers.refresh(id)`. `isEditing()` now = a target is active.
  - `lib/layers.ts`: added `get(id)` and `refresh(id)` (re-run `addDeckLayer` from
    the source after a write-back).
  - `components/DrawToolbar(.View)`: renders only while editing; shows Select +
    the target's single geometry draw button + Delete + Save + Cancel + an
    "Editing <layer>" scope pill. Save/Cancel wired to `commit`/`finishEdit`.
  - Entry points: LayersPanel context-menu "Toggle editing" (catalog layers only;
    disabled while editing another; inline error surface + per-row "editing"
    badge); a `NewLayerModal` (name + geometry type) wired to the Layers panel "+"
    → `editing.beginNewLayer`.
  - `design-system` DrawToolbar story + `DrawMode` export updated to the new props.
  - Verified: frontend + design-system typecheck, frontend build all pass. The
    write-back SQL (rowid load, UPDATE/INSERT/DELETE in a txn, quoted new-table
    CREATE, current_database()) runs clean against DuckDB — rowids stay stable
    across in-transaction updates.
  Next: eyeball in the preview — new-layer draw+Save, and edit-in-place of a small
  catalog layer (move vertices, Save, confirm the table changed). Terra Draw JS
  integration (feature load / snapshot / property round-trip) is the part only a
  click-through confirms.
- 2026-07-20: Reworked the toolbar's placement per user feedback (don't float it
  in the middle; put an Edit button in the top-left corner like the other map
  controls that extends into the full toolbar). Also closed the three cleanup
  tickets the T-038 /simplify review spawned (T-042/T-043/T-044) in the same pass.
  - **Collapsed → expanded toolbar.** `DrawToolbarView` is now position-free and
    renders a collapsed **Edit** pill when `!expanded` (pencil + active-layer
    name) and the full digitising bar when `expanded`. `MapPanel` owns a top-left
    overlay stack (`absolute top-3 left-3`) holding the toolbar over the selection
    chip; `SelectionChipView` dropped its own positioning. `DrawToolbar` now
    subscribes to `layers` too and, when idle, binds the Edit button to the
    **active layer** — clicking it calls `editing.beginEdit(active)` (errors, incl.
    the row-cap guard, surface in the toolbar's error slot).
  - **Active layer (QGIS concept).** `layers` store gained `activeId` /
    `active()` / `setActive()`; the Layers-panel row highlight now reads from it
    (was local `selectedId` state), so the panel selection and the Edit button
    share one source of truth. Cleared when the active layer is removed.
  - **T-043 (deck suppression).** Added a `suppressed` flag on the deck layer
    record distinct from user `visible` (`deckRender.setDeckLayerSuppressed`);
    render gate is `visible && !suppressed`. `editing` begin/finish/`destroy` now
    drive suppression, never the Eye's `visible`, so edit mode can't clobber a
    user-hidden layer and an unmount mid-edit restores the copy.
  - **T-042 (batched commit).** Existing-layer `commit()` now dirty-tracks changed
    Terra Draw ids (from the `change` event) and issues a constant number of
    batched statements — one multi-row `INSERT`, one `UPDATE … FROM (VALUES …)`
    (touched rows only), one `DELETE … WHERE rowid IN (…)`. Verified the batched
    SQL against DuckDB spatial (correct id→geometry diff; untouched rows skipped).
  - **T-044 (de-dup).** Shared modal `INPUT` className hoisted to `Modal.tsx`
    (used by NewLayer/Attach/Overture); `sqlLit` now imported from `lib/duckdb.ts`
    in `layers.ts`/`attach.ts`/`tiles.ts` (local copies deleted).
  - Verified: frontend `tsc --noEmit` + `build` and design-system `typecheck` all
    pass; batched write-back SQL runs clean on DuckDB. Remaining: interactive
    eyeball in preview (collapsed→expanded Edit button, hidden-layer edit round
    trip, one-vertex save writes one batched UPDATE).
