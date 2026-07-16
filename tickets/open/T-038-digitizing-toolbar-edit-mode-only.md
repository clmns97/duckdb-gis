---
id: T-038
title: Show the digitizing toolbar only in edit mode (edit a layer / new layer)
status: open
priority: P2
area: frontend
depends_on: [T-025]
branch:
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

- [ ] The digitizing toolbar is hidden by default; the map has no editing UI until
      edit mode is entered.
- [ ] Layer context menu offers "Toggle editing"; entering it binds the toolbar to
      that layer and constrains drawing to the layer's geometry family.
- [ ] A "New layer" command prompts for name + geometry type, creates an empty
      single-geometry layer, and enters edit mode on it.
- [ ] Editing an existing layer loads its features editable, and Commit writes the
      edits back to that layer's table (not a new `scratch_N`), re-rendered
      through the normal GeoArrow path. Large-layer behavior is guarded/messaged.
- [ ] A single layer never ends up with mixed geometry types via this flow.
- [ ] "Stop editing"/Cancel discards the working set without committing.
- [ ] `pnpm --dir frontend typecheck` and `build` pass; exercised in the preview:
      new-layer create+draw+commit, and edit-in-place of an existing small layer.

## Progress log

- 2026-07-16: Opened from user feedback that the always-on toolbar "breathes a new
  layer every time" with no way to edit an existing one. Decisions captured: two
  entry points (context-menu "Toggle editing" + top-level "New layer"), edit-in-place
  IS in scope (load existing layer into the MapLibre working set, commit back by
  `__fid`), one geometry family per layer, toolbar hidden unless a layer is being
  edited. Depends on T-025 (the Terra Draw working set + commit path already exist).
  Coordinate geometry-kind with T-039.
