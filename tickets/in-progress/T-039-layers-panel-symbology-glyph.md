---
id: T-039
title: Show geometry-typed symbology swatch in the Layers panel
status: in-progress
priority: P2
area: frontend
depends_on: []
branch:
---

## Goal

Each layer row in the Layers panel shows a swatch that reflects the layer's
actual symbology: a point layer shows a filled dot, a line layer shows a stroke,
a polygon layer shows a filled outlined square — each drawn in that layer's own
fill/line colors. "Done" means a glance at the panel tells you both the geometry
family and the color a layer draws with, matching what's on the map (QGIS's
layer-tree symbol preview).

## Context

<context>
Today every layer row renders the same generic swatch — a fixed rounded square
in the theme primary/accent colors, independent of geometry or the layer's real
style:

```
// LayersPanel.tsx:154-157
<span className="w-3 h-3 shrink-0 rounded-[3px] bg-primary border border-accent" />
```

The layer already carries editable symbology in `ActiveLayer.style`
(`lib/layers.ts:62-63` → `LayerStyle` in `deckRender.ts:235-241`): `fillColor`,
`lineColor` (each `[r,g,b]`), `fillOpacity`, `lineWidth`, `pointRadius`. So the
colors are available — the swatch just doesn't use them.

**Missing piece: geometry family isn't persisted on the layer.** `nextStyle`
(`deckRender.ts:262-272`) is seeded *from* a `geomType` string at add time
(`ST_GeometryType` probe), but only the resulting `LayerStyle` is stored, not the
type. To pick a point/line/polygon glyph we need to keep the geometry family
around. Options:
- Add a `geometryKind: "point" | "line" | "polygon"` (or similar) to
  `ActiveLayer`, set in `add` / `addQuery` from the same probe that seeds the
  style (`addDeckLayer` already resolves the geom type — return it alongside
  `bounds`/`style`), or
- Derive it from which static layer family `addDeckLayer` chose
  (`POINT_STATIC` / `PATH_STATIC` / `POLYGON_STATIC`, deckRender.ts:332-360).

Then render a small glyph component keyed on the family, filled with the style's
colors (fill = `fillColor`@`fillOpacity`, stroke = `lineColor`):
- point → filled circle
- line → a diagonal/horizontal stroke
- polygon → filled square with outline

Note there is already a `TypeGlyph.tsx` (untracked, from T-034) for *column* type
glyphs in the attribute table — that's a different concept (data types, not
geometry symbology); don't conflate them, though the visual language should feel
consistent.

Coordinate the leading-icon column with **T-037** (row grid alignment) so the
glyph sits in the shared icon slot. A loading/unknown layer (no `style` yet)
should fall back to a neutral placeholder so the row doesn't jump.

A stretch nicety: clicking the swatch could open Layer Properties ▸ Symbology
(the kebab already offers it) — out of scope unless trivial.
</context>

## Acceptance criteria

- [ ] Point layers show a dot, line layers a stroke, polygon layers a filled
      outlined square in the Layers panel.
- [ ] The glyph uses the layer's own `style` colors (fill + line), and updates
      live when symbology is edited via Layer Properties (T-010).
- [ ] Geometry family is resolved once at add time (no per-render re-probe) and
      persisted on `ActiveLayer`.
- [ ] Layers still loading (no style yet) show a neutral placeholder, not a jump.
- [ ] `pnpm --dir frontend typecheck` and `build` pass; exercised in the preview
      with a point, a line, and a polygon layer.

## Progress log

- 2026-07-16: Opened from panel review. Colors already live on `ActiveLayer.style`;
  the gap is that geometry family isn't persisted — plumb it from the add-time
  `ST_GeometryType` probe (via `addDeckLayer`) onto `ActiveLayer`, then render a
  family-keyed glyph tinted from `style`. Keep distinct from the column-type
  `TypeGlyph` (T-034). Coordinate the icon slot with T-037.
- 2026-07-16: Implemented. `deckRender.ts` gained `GeometryKind` +
  `geometryKindOf(probe.type)`; `addDeckLayer`'s `AddedLayerOutcome` now returns
  `geometryKind`, which both `layers.add`/`addQuery` `patch` onto
  `ActiveLayer.geometryKind` (resolved once, no per-render re-probe). New
  `SymbologyGlyph.tsx` renders a point dot / line stroke / filled outlined
  polygon square tinted from `style` (fill = `fillColor`@`fillOpacity`, stroke =
  `lineColor`), with a neutral gray placeholder while loading; it replaced the
  generic swatch in `LayersPanel.tsx`. Live symbology updates ride the existing
  `layers.setStyle` → `patch(style)` → version bump. Rode the T-037 touch fix
  along (see that ticket). `pnpm --dir frontend typecheck` + `build` clean.
  Remaining: exercise in the preview (point/line/polygon + live restyle).
