---
id: T-010
title: Layer styling / symbology
status: open
priority: P2
area: frontend
depends_on: [T-001]
branch:
---

## Goal

Let the user control how a layer is drawn — fill/line color, opacity, line
width, point size/radius — instead of the current hardcoded styles. This is the
"Symbology" half of what QGIS puts in its **Layer Properties** dialog.

## Context

<context>
UX reference / vocabulary: QGIS's **Layer Properties ▸ Symbology**. Start with
**single-symbol** styling (one style for the whole layer). Categorized /
graduated (data-driven) styling is a later follow-up — note it, don't build it
yet.

Today styles are hardcoded in `frontend/src/lib/deckRender.ts`: the layer
factories set fixed colors — `getFillColor: [99, 102, 241, 200]` for points
(~line 70), path color (~line 77–88), `getFillColor: [99, 102, 241, 90]` for
polygons (~line 89–95). To make style user-controlled, these must become
parameters driven by per-layer style state rather than constants.

Depends on layers being first-class objects (from [[T-001]] / the Layers panel
[[T-002]]) so a style can attach to a specific layer. Where the styling UI
lives — a panel/popover off the Layers panel (a "Layer Properties" surface) —
should be decided with [[T-011]] (info/metadata), since QGIS co-locates them.

Open points (note in Progress log):
  - Per-geometry-type controls (point radius vs. line width vs. fill).
  - Where style state lives and whether it persists (tie to notebook/state
    storage decisions later).
</context>

## Acceptance criteria

- [ ] User can change at least fill color, line color, opacity, and size/width
      for a selected layer; the map updates live.
- [ ] Styles are per-layer (changing one doesn't affect others).
- [ ] Hardcoded constants in `deckRender.ts` are replaced by style-driven props.
- [ ] Categorized/graduated styling is explicitly scoped out and noted as a
      follow-up.
- [ ] Frontend build/lint passes; looks right light/dark.

## Progress log

- 2026-07-09: Ticket created. Not started. Co-design the "Layer Properties"
  surface with [[T-011]].
- 2026-07-13: Done, built together with [[T-011]] on one Layer Properties
  dialog. Implementation:
  - `lib/deckRender.ts`: introduced `LayerStyle` (fillColor, lineColor,
    fillOpacity, lineWidth, pointRadius). The `added`-layer records now carry a
    `style` instead of a fixed `Palette`; the `*_STATIC` factories read it, so
    the former hardcoded constants are gone. `nextStyle(geomType)` seeds a new
    layer's default from the cycled palette (opacity/width lean on geometry
    type to preserve the prior look). New `setDeckLayerStyle(id, style)`
    re-styles live via `syncOverlay` (no re-query).
  - `lib/layers.ts`: `ActiveLayer.style` mirrors the render style;
    `layers.setStyle(id, changes)` merges + pushes to the render layer + emits.
  - `components/LayerProperties.tsx` (Symbology tab): color pickers + opacity /
    line-width / point-size sliders; edits apply live and are per-layer.
  - Scope decisions (noted): (1) styling covers the persistent *added* layers
    (the Layers-panel layers). The SQL-editor Run-preview / selection path
    (`POINT`/`PATH`/`POLYGON` pickable factories) keeps its amber-highlight
    palette — it's a selection surface, not a user layer, out of scope here.
    (2) Categorized / graduated (data-driven) styling explicitly deferred;
    single-symbol only, called out in the Symbology tab note.
  - `tsc --noEmit` + `vite build` pass. Runtime not driven end-to-end (no
    spatial fixture wired into an automated check); logic verified by review.
