---
id: T-027
title: Promote a SQL editor Run result to a tracked temporary layer
status: done
priority: P1
area: frontend
depends_on: []
branch: t-025-draw-edit-geometry
---

## Goal

When the user Runs a geometry query in the SQL editor, the result should appear
as a real **layer in the Layers panel** — a *temporary* / query-backed layer —
instead of a nameless preview that just floats on the map untied to anything.
The user's observation: today only SQL-editor features are selectable, but they
"just sit in the map" with no entry in the Layers pane, so they can't be
toggled, styled, zoomed-to, ordered, or removed like every other layer. Giving
the Run result a home in the Layers panel closes that gap.

## Context

<context>
Today there are **two parallel render paths** in `frontend/src/lib/deckRender.ts`:

- **Persistent added layers** — `addDeckLayer(id, sql)` registers into the
  `added` Map and draws via the *non-pickable* `spec.staticLayer` builders
  (`*_STATIC`). These are what the Layers panel (`layers.ts` store) tracks.
- **The SQL editor Run preview** — `renderGeoArrow(userSql)` (line ~365) sets a
  single `rendered` slot drawn via the *pickable*, selection-highlighted
  builders, and calls `selection.setSource(inner)`. `EditorPanel.tsx` (line ~24)
  calls this on Run. This preview is **not** in the `layers` store, so it never
  shows in the Layers panel.

That split is exactly why "only SQL-added features are selectable" (the preview
is the one pickable layer) *and* why they have no Layers-panel row.

The layer store already has the right entry point: `layers.addQuery({id, name,
sql})` in `frontend/src/lib/layers.ts:155` — the same one Overture (T-012) uses
for query-backed layers (`ActiveLayer.source` is optional). The missing piece is
routing the editor's Run through the layer store and deciding how the "temporary"
nature is modelled and how selection is preserved.

Design points to resolve (record choices in the Progress log):
  - **Temp vs. persistent naming.** A Run result is ephemeral — re-Running should
    replace it, not accumulate. Options: a single fixed id (e.g. `L_sql_preview`)
    that re-Run overwrites (mirrors the current single `rendered` slot), or a
    "Query result N" that the user can pin. Recommend: one replaceable temp
    layer, with a visible "temporary" affordation in the panel row.
  - **Selection parity.** `addDeckLayer`'s static builders aren't pickable, so a
    naive `addQuery` would *lose* selection on the SQL result. Either keep the
    Run result on the pickable `rendered` path but *also* register a Layers-panel
    row that maps to it, or unify the two paths so added layers can be pickable.
    Making all layers selectable is broader — see [[T-003]]; keep this ticket
    scoped to "the SQL result is a layer AND stays selectable."
  - This work is likely reframed by the in-memory working-DB architecture
    ([[T-028]]) — a temp layer is really a table in the `:memory:` working
    database. Coordinate; this ticket can land the UX-level fix first.
</context>

## Acceptance criteria

- [x] Running a geometry query in the SQL editor adds/updates a row in the
      Layers panel (a temporary / query-backed layer), not just a bare map
      preview.
- [x] Re-Running replaces that temp layer rather than stacking a new one.
- [x] The temp layer supports the standard layer actions: visibility, remove,
      zoom-to (T-022), and shows loading/error state like other layers.
- [x] Selection on the SQL result still works (features stay pickable /
      highlightable); if selection parity can't be preserved, that's called out
      explicitly and deferred with a note.
- [x] The row is visibly marked as temporary (distinct from catalog-backed
      layers) so the user knows it isn't persisted.
- [x] Frontend build + typecheck pass.

## Progress log

- 2026-07-14: Ticket created from user feedback — SQL-editor features render on
  the map but have no Layers-panel entry, and only they are selectable. Depends
  conceptually on the [[T-028]] `:memory:` architecture decision but the
  UX-level "Run result is a layer" fix can land independently.
- 2026-07-14: Implemented the UX-level fix. **Decision: one replaceable temp
  layer** (fixed id `PREVIEW_ID = "L_sql_preview"`, name "SQL result") that
  mirrors the existing pickable preview slot — the geometry still renders through
  `renderGeoArrow`/`rendered`, so **selection parity is fully preserved** (the
  result stays pickable/highlightable; no move to the non-pickable `addDeckLayer`
  static path). `EditorPanel.run` now brackets the render with
  `layers.startPreview(sql)` → `readyPreview(bounds)` / `errorPreview(msg)`,
  giving the row a loading→ready/error lifecycle. `renderGeoArrow` now returns
  `bounds` (added to `DeckOutcome`) so zoom-to works. Standard actions wired via
  the store: **visibility** (`layers.setVisible` → new `setPreviewVisible` in
  deckRender toggles a `renderedVisible` flag, no re-query, selection intact; a
  fresh Run always re-shows), **remove** (temp path calls `clearDeck()` instead
  of `removeDeckLayer`), **zoom-to** (existing `zoomTo` on stored bounds). Panel
  shows a **"temp" badge** and a "hidden" hint; a Show/Hide item was added to the
  layer context menu (applies to all layers). Coordinates with [[T-028]]: a temp
  layer is conceptually a `:memory:` working-DB table; this lands the UX now,
  materialization comes with that RFC. `pnpm build` + `tsc` pass.
