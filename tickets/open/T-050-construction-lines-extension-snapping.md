---
id: T-050
title: Construction/reference lines & extension-intersection snapping (CAD guides)
status: open
priority: P3
area: frontend
depends_on: [T-038, T-049]
branch:
---

## Goal

While drawing, a user can turn edges of existing features into **construction
guides** — Vectorworks SmartCursor / QGIS-advanced-digitizing style. Select an
edge (or two), and its **infinite extension** is drawn as a reference line; the
cursor snaps to points along that extension, to parallels/perpendiculars of it,
and — the headline case — to the **intersection of two extensions**. So: pick two
edges from two polygons, see their extensions cross, and place a vertex exactly on
that intersection even though no real geometry sits there. "Done" means a user can
construct precise vertices from the geometry that's already on the map, not just
from vertices that physically exist.

## Context

<context>
Requested by the user (2026-07-20) as a Vectorworks feature they valued:
construction lines while drawing, mark a line to draw along its extension, and
snap to the intersection of two extended lines. This is CAD "reference/guide"
geometry — transient overlays that constrain the cursor but are never part of any
layer.

This is a **large, research-heavy feature** and almost certainly exceeds Terra
Draw's built-in snapping (see T-049). Budget a **spike first** (use `spike/`) to
answer: can Terra Draw's snap pipeline be extended with a custom snap provider, or
do we compute snap candidates ourselves and feed Terra Draw a locked coordinate?
Terra Draw is owned by the editing store (`frontend/src/lib/editing.ts` `init()`,
`editing.ts:191-215`), and the shared map is reachable via `getMap()`
(`mapBus`, imported `editing.ts:43`).

Pieces:
1. **Designate guides.** A mode/gesture to pick an existing edge and promote it to
   a construction guide. Source edges can come from the working set (Terra Draw
   snapshot, `editing.ts:376`) and ideally from visible read-only layers — but
   those live in deck.gl GeoArrow buffers, not Terra Draw (`deckRender.ts`), so
   getting their geometry may need a DuckDB query for the nearby feature's edges.
   Scope the first cut to the working set to avoid that.
2. **Render guides.** Draw the extension lines as a transient overlay. Cleanest as
   a dedicated MapLibre GL source+layer added via `getMap()` (not a layer table,
   not a Terra Draw feature) so guides never enter the catalog or the commit set.
   Style them as thin dashed reference lines.
3. **Snap candidates.** Compute, per cursor move: nearest point on a guide line,
   guide×guide intersection (the key one), and guide×working-geometry
   intersection. Geometry math can be done in JS (line-line intersection is cheap)
   or via DuckDB `ST_Intersection` for robustness with real feature edges. Feed
   the chosen candidate back as the placed coordinate.
4. **Lifecycle.** Guides are cleared on finishing/cancelling the draw
   (`finishEdit`, `editing.ts:351`; `destroy`, `editing.ts:432`) and are never
   committed (`commit()` only writes `isWorkingFeature` features, `editing.ts:376`).

Coordinate with **T-049** (base snapping — modes/tolerance/store shape) and
**T-051** (constrained input; "angle relative to a construction line" ties the two
together). Icons/affordances from Claude Design where applicable — out of scope.

Gotcha: an "infinite" extension must be clipped to the current viewport for
rendering, but the *math* should use the true infinite line so intersections
outside the view still resolve.
</context>

## Acceptance criteria

- [ ] Spike outcome recorded (Terra Draw custom-snap feasibility) and the chosen
      architecture noted in this ticket before building.
- [ ] A user can promote an existing edge to a construction guide; its extension
      renders as a transient reference line (never a layer, never committed).
- [ ] The cursor snaps to points on a guide and to the **intersection of two
      guides**, placing a vertex exactly there.
- [ ] Guides clear on finish/cancel and never appear in the commit set or catalog.
- [ ] `pnpm --dir frontend typecheck` + `build` pass; verified in the preview
      (two edges → extensions → place a vertex on their intersection).

## Progress log

- 2026-07-20: Filed from user request (Vectorworks-style construction lines +
  extension-intersection snapping). Flagged as large/spike-first — likely beyond
  Terra Draw's built-in snapping; needs a transient guide overlay via `getMap()`
  and custom snap-candidate math. Depends on T-049 (snapping base) and pairs with
  T-051 (constrained input). Set P3 as an advanced follow-up.
</content>
</invoke>
