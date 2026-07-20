---
id: T-049
title: Snapping options for digitizing (toggle + point/line/center modes)
status: open
priority: P2
area: frontend
depends_on: [T-038]
branch:
---

## Goal

While editing, a user can toggle **snapping** on/off and choose what to snap to —
existing **vertices/points**, **lines/edges**, and feature **centers** — so new
and edited geometry latches onto nearby features instead of being placed
free-hand. "Done" means: a snapping control in the digitizing UI enables/disables
snapping and exposes the individual snap modes, and drawing/vertex-editing honors
the active modes.

## Context

<context>
Part of making the feature-editing toolbar feature-rich (user request,
2026-07-20). Built on T-038's editing mode. **The toggle icon itself is being
designed in Claude Design and is out of scope** — this ticket is the behavior and
the options surface behind it; use a placeholder trigger following the existing
custom-SVG pattern (`components/DrawToolbarView.tsx:45-114`).

Shape:
- Terra Draw supports snapping via mode configuration (recent versions expose
  snapping options such as snapping to existing coordinates/lines). **Verify the
  exact snapping API for the installed `terra-draw` version**
  (`frontend/package.json`) before wiring — the option names and granularity
  (point vs. line vs. center) differ across versions, and "center" snapping may
  need a custom snap provider if not built in. Terra Draw is constructed in
  `editing.ts` `init()` (`editing.ts:191-215`), where draw modes
  (`TerraDrawPointMode` / `LineStringMode` / `PolygonMode`) and the select-mode
  flags are set — snapping options attach here and/or per `setMode`
  (`editing.ts:315`).
- Add snapping state to the `editing` store: an enabled flag + a set of active
  snap modes (`point` | `line` | `center`), exposed like `mode`/`allowedDrawMode`
  (`editing.ts:165-178`) via the `version`/`subscribe`/`useSyncExternalStore`
  pattern. Changing options must reconfigure the live Terra Draw modes (may
  require re-applying mode config or re-init of the affected modes — confirm what
  Terra Draw needs to pick up a snapping change mid-session).
- Snap targets: the user likely wants to snap to the layer's *own* existing
  features (already in the working set for edit-in-place) and possibly other
  visible layers. First cut: snap within the working set. Snapping across to the
  read-only deck layers is a stretch (their geometry isn't in Terra Draw).
- UI: a snapping toggle button + a small popover/menu of the three snap modes,
  placed in the digitizing toolbar (`DrawToolbarView.tsx:229`). Prop-driven and
  store-free like the rest of the view; keep the design-system story in sync
  (`design-system/src/stories/DrawToolbar.stories.tsx`, `design-system/src/index.ts`).

Gotcha: snapping tolerance is in screen or map units depending on the API; pick a
sensible pixel tolerance so snapping feels right across zoom levels.
</context>

## Acceptance criteria

- [ ] A snapping control toggles snapping on/off and exposes point, line, and
      center snap modes (multi-select).
- [ ] With snapping on, drawing/vertex-editing latches onto the active target
      types within the working set; with it off, placement is free-hand.
- [ ] Snapping state lives in the `editing` store and reconfigures the live Terra
      Draw session when changed.
- [ ] The three snap modes each have an observable effect (or a documented note
      if a mode needs a custom provider deferred to a follow-up).
- [ ] `pnpm --dir frontend typecheck` + `build` pass; design-system typecheck
      passes; verified in the preview (snap a new vertex onto an existing one).

## Progress log

- 2026-07-20: Implemented (first cut). Snapping state (`snapEnabled`) added to the
  `editing` store; a toolbar toggle drives `toggleSnapping()`, which pushes a
  `Snapping` config (`toCoordinate` + `toLine`) to the live line/polygon draw
  modes via Terra Draw's `updateModeOptions` (verified available in
  terra-draw@1.32; called through a narrow cast for its awkward generic). So new
  drawing latches onto existing vertices/edges within the working set. Point +
  line snap ship; **"center" snap has no native Terra Draw support and is
  deferred** (would need a custom snap provider). Multi-select of individual snap
  sub-modes (a popover) also deferred — the current control is a single on/off
  toggle enabling point+line. Frontend tsc+build + design-system tsc pass;
  snap-onto-existing-vertex to be eyeballed in preview.
- 2026-07-20: Filed from user request (feature-rich editing toolbar). Scope is the
  snapping *behavior* + options surface; the toggle icon comes from Claude Design
  (out of scope). Flagged that the Terra Draw snapping API must be verified against
  the installed version and that "center" snapping may need a custom provider.
</content>
</invoke>
