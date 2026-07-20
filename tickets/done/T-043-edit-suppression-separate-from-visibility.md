---
id: T-043
title: Edit-time deck suppression shouldn't ride the user visibility flag
status: open
priority: P1
area: frontend
depends_on: [T-038]
branch:
---

## Goal

Entering/leaving edit mode on a layer must not corrupt that layer's
user-controlled visibility. A layer the user had hidden before editing stays
hidden after; toggling the Eye while editing never double-draws the read-only
copy under the editable set; and a map unmount mid-edit never leaves a layer
permanently invisible.

## Context

<context>
Introduced in T-038. To avoid double-drawing the read-only deck.gl copy over the
Terra Draw editable working set, `beginEdit` hides the deck copy and the exit
paths restore it — but it does so by mutating the *same* `visible` flag that the
Eye toggle drives:

- `editing.ts:308` `setDeckLayerVisible(layer.id, false)` on entering edit.
- `editing.ts:359` `setDeckLayerVisible(t.layerId, true)` in `finishEdit()`.
- `lib/deckRender.ts:643` `setDeckLayerVisible` sets `al.visible` — the exact
  field `layers.setVisible` drives for the Eye toggle
  (`deckRender.ts:576` `if (!al.visible) continue;`).

Consequences of overloading one flag:
1. **Lost user-hidden state.** `finishEdit` unconditionally forces `visible =
   true`, clobbering a layer the user had hidden before they started editing.
2. **Double-render.** Any Eye toggle mid-edit re-shows the deck copy underneath
   the editable set.
3. **Permanently hidden on teardown.** `destroy()` (`editing.ts:432`, the map
   unmount path) nulls `target` but — unlike `finishEdit` — never restores
   visibility, so a map unmount during an existing-layer edit leaves the deck
   copy suppressed with no way back.

Deeper fix (pick one):
- Have deckRender's existing edit gate *exclude the layer under edit* from
  rendering — the render path already knows `isEditing`/`target` via
  `setDrawHooks` (`deckRender.ts:40`), so suppression can be derived rather than
  stored, and the user `visible` flag is never touched; **or**
- Add a separate `suppressed` (edit-only) flag on the deck layer, distinct from
  user `visible`, and have the render gate honor `visible && !suppressed`.

Either way, entering/leaving edit must not read or write the user's `visible`,
and all exit paths (`finishEdit`, `commit` success, `destroy`) must clear
suppression consistently.

Surfaced by the T-038 `/simplify` review (altitude angle) as the top structural
finding; deferred because the fix reaches into `deckRender.ts`, outside that
diff.
</context>

## Acceptance criteria

- [x] Editing a layer the user had hidden and then stopping leaves it hidden.
- [x] Toggling the Eye while editing does not re-show the read-only deck copy
      under the editable set.
- [x] Map unmount / `destroy()` mid-edit does not leave a layer permanently
      invisible.
- [x] Edit-suppression state is separate from the user `visible` flag (derived
      from edit state, or a distinct field) — the two never clobber each other.
- [x] Frontend `tsc --noEmit` passes; verified by editing a hidden layer and by
      toggling visibility mid-edit.

## Progress log

- 2026-07-20: Filed from T-038 /simplify review (altitude finding).
- 2026-07-20: Fixed alongside the T-038 toolbar rework. Added a distinct
  `suppressed` field to the deck layer record in `deckRender.ts` (separate from
  user `visible`); the render gate is now `if (!al.visible || al.suppressed)
  continue`, and a re-add preserves `suppressed`. New export
  `setDeckLayerSuppressed(id, on)` sets only that field. `editing.ts` now drives
  suppression, never `visible`: `beginEdit` → suppress, `finishEdit`/commit →
  unsuppress, and `destroy()` unsuppresses a mid-edit existing target so an
  unmount can't strand a hidden layer. The Eye toggle keeps writing `visible`
  only, so the two states no longer clobber each other. Frontend `tsc --noEmit` +
  `build` pass.
