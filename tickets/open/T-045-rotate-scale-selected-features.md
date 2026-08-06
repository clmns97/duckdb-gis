---
id: T-045
title: Rotate & scale selected features in the digitizing toolbar
status: open
priority: P2
area: frontend
depends_on: [T-038]
branch:
---

## Goal

While editing a layer, a user can select a feature (or several) and **rotate** or
**scale** it interactively — grab a handle, drag, and the geometry transforms
about its centroid — then Save writes the transformed geometry back like any
other vertex edit. "Done" means rotate and scale join Select/Draw/Delete as
first-class digitizing tools that operate on the current selection, with the
result committed through the existing T-038 write-back path (no new commit
plumbing).

## Context

<context>
Part of making the feature-editing toolbar feature-rich (user request,
2026-07-20). Built on T-038's editing mode: the editable working set is a Terra
Draw / MapLibre GeoJSON source, and Save already diffs it back to the layer's
table by `rowid` (`frontend/src/lib/editing.ts` `commit()`, `editing.ts:374`).
Rotate/scale only change geometry in the working set — the existing commit path
carries them, so this is toolbar + Terra Draw config, not new SQL.

Key hooks:
- Terra Draw is configured in `editing.ts` `init()` (`editing.ts:191`). The
  `TerraDrawSelectMode` is created with per-geometry `flags` (`editing.ts:199-214`);
  today only `feature.draggable` + `coordinates` (drag/midpoint/delete) are on.
  Terra Draw's select mode also supports **rotate** and **scale** feature flags —
  verify the exact flag names against the installed `terra-draw` version
  (`frontend/package.json`) before wiring; the transform then happens natively and
  fires the same `change`/`finish` events already handled by `refresh`
  (`editing.ts:217-218`).
- Modes are constrained to Select + the target's one draw family (`setMode`,
  `editing.ts:315`; `EditMode` union `editing.ts:58`). Rotate/scale are *sub-modes
  of Select* (they act on the current selection), so decide whether they are new
  `EditMode` entries or select-mode flags toggled via UI — a toggle that flips the
  select-mode flags on/off is likely simpler than a new mode.
- Toolbar surface: `components/DrawToolbarView.tsx` (segmented icon bar,
  `DrawToolbarView.tsx:229`) and its store wrapper `components/DrawToolbar.tsx`.
  Add rotate/scale tool buttons next to Delete; enable them only when
  `selectedCount > 0` (`selectedCount` already exposed, `editing.ts:342`). Icons
  will be provided via Claude Design — **out of scope here**; use placeholder
  glyphs following the existing custom-SVG pattern (`DrawToolbarView.tsx:45-114`).
- Keep the design-system mirror in sync: `DrawToolbar` story + exported props
  (`design-system/src/stories/DrawToolbar.stories.tsx`, `design-system/src/index.ts`).

Gotcha: rotate/scale must respect the one-geometry-family rule (they don't change
geometry type, so they're fine) and only act on selected features, not the whole
working set.
</context>

## Acceptance criteria

- [ ] Rotate and Scale tools appear in the digitizing toolbar, enabled only when
      one or more features are selected in Select mode.
- [ ] Dragging a rotate/scale handle transforms the selected feature(s) live on
      the map; releasing leaves the transformed geometry in the working set.
- [ ] Save persists the transformed geometry via the existing T-038 write-back
      (existing layer → UPDATE by `rowid`; new layer → included in CREATE TABLE).
- [ ] Transforms never change a feature's geometry family; only Select-mode
      features are affected.
- [ ] `pnpm --dir frontend typecheck` and `build` pass; design-system typecheck
      passes; exercised in the preview (rotate + scale a feature, Save, confirm
      the stored geometry changed).

## Progress log

- 2026-07-20: Implemented. Enabled Terra Draw's `rotateable`/`scaleable` select
  flags (`editing.ts init()`) with single-key modifiers (`keyEvents`
  `rotate:['r']`, `scale:['s']`) — hold R/S and drag a selected feature for
  continuous transform. Verified against terra-draw@1.32: rotate/scale are
  **key+drag**, not on-screen handles, so as a click-driven complement the store
  also got `rotateSelected(15°)` / `scaleSelected(1.1×)` that transform the
  selection about its shared bbox centre via `updateFeatureGeometry` (marks the
  rows dirty → Save persists through the T-038 path). Toolbar Rotate/Scale
  buttons (placeholder glyphs) enabled when `selectedCount>0`. Frontend
  tsc+build + design-system tsc pass. Interactive rotate/scale + Save round-trip
  still to be eyeballed in preview. Note the AC "grab a handle, drag" is met via
  key+drag (Terra Draw has no rotate/scale handles) plus the click-increment.
- 2026-07-20: Filed from user request to make the feature-editing toolbar
  feature-rich (merge/split/duplicate/rotate/scale/copy + snapping). Rotate/scale
  grouped because both are Terra Draw select-mode transforms on the current
  selection and share the commit path. Icons come from Claude Design (out of scope).
</content>
</invoke>
