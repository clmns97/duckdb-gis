---
id: T-048
title: Duplicate and copy/paste selected features
status: open
priority: P2
area: frontend
depends_on: [T-038]
branch:
---

## Goal

While editing a layer, a user can **duplicate** the selected feature(s) in place
(a clone they can then drag off), and **copy**/**paste** features (copy the
selection, paste it — into the same layer for now — as new features). "Done"
means: select a feature, Duplicate (or Copy then Paste) produces an independent
new feature in the working set that Save persists as a new row.

## Context

<context>
Part of making the feature-editing toolbar feature-rich (user request,
2026-07-20). Built on T-038's editing mode. Duplicate and copy/paste are pure
working-set operations — no spatial SQL needed; they clone GeoJSON and let Save's
existing INSERT path (`editing.ts:409`) write the new geometry.

Shape:
- **Duplicate:** clone each selected feature (`selectedIds`, `editing.ts:116`;
  snapshot via `draw.getSnapshot().filter(isWorkingFeature)`, `editing.ts:376`),
  give each clone a fresh `uuid()` (`editing.ts:454`) and **no `__rid`** (so Save
  treats it as an INSERT, not an UPDATE of the source row — see the diff at
  `editing.ts:402-410`), optionally nudge it by a small offset so it's visibly
  distinct, and add via `draw.addFeatures` (cf. `beginEdit`, `editing.ts:298`).
  Select the clones so the user can immediately drag them.
- **Copy / Paste:** hold the copied features in a module-level clipboard buffer in
  `editing.ts` (plain GeoJSON, no map dependency). Paste = same clone logic as
  Duplicate, from the buffer. Cross-layer paste (paste into a *different* layer)
  is a stretch — for a first cut, restrict paste to the same edit target and only
  when the clipboard geometry matches the target's `geometryKind`
  (`allowedDrawMode`, `editing.ts:176`); reject a mismatch with the existing
  `error` surface.
- Toolbar: add Duplicate / Copy / Paste buttons to `DrawToolbarView.tsx`
  (`:229`). Enable Duplicate + Copy when `selectedCount > 0`; enable Paste when
  the clipboard is non-empty and family-compatible. Icons from Claude Design —
  **out of scope**; placeholders per `DrawToolbarView.tsx:45-114`. Keep the
  design-system story in sync (`design-system/src/stories/DrawToolbar.stories.tsx`).
- Consider keyboard shortcuts (Ctrl/Cmd+C / Ctrl/Cmd+V / Ctrl/Cmd+D) but only
  while editing and when the map/toolbar has focus — don't hijack browser copy in
  text inputs. Optional for a first cut.

Gotcha: the whole value of Duplicate is that the clone is *independent* — verify
a deep clone of the geometry (not a shared reference) so dragging the copy
doesn't move the original.
</context>

## Acceptance criteria

- [ ] Duplicate clones the selected feature(s) into new, independent features in
      the working set (fresh ids, no `__rid`), selectable/draggable immediately.
- [ ] Copy stores the selection; Paste adds clones from the clipboard buffer.
- [ ] Pasting a geometry family that doesn't match the target layer is rejected
      with a clear message.
- [ ] Save persists duplicated/pasted features as new rows (INSERT), leaving the
      originals untouched.
- [ ] Cloned geometry is deep-copied (moving a clone never moves the original).
- [ ] `pnpm --dir frontend typecheck` + `build` pass; verified in the preview
      (duplicate a feature, drag it away, Save, confirm a new row).

## Progress log

- 2026-07-20: Implemented. `editing.duplicateSelected()` / `copySelected()` /
  `paste()` in the store; a module-level `clipboard` holds deep-cloned GeoJSON
  (no map dep). Clones get a fresh `uuid()`, **no `__rid`** (Save INSERTs them),
  and a small on-screen offset (`CLONE_OFFSET`) so they're grabbable; geometry is
  deep-copied (`JSON.parse(JSON.stringify)`) so moving a clone never moves the
  original. Paste rejects a family mismatch (guarded by `canPaste` + a thrown
  error to the toolbar error slot). Toolbar Duplicate/Copy enabled at
  `selectedCount>0`, Paste at `canPaste`. Keyboard shortcuts deferred. Frontend
  tsc+build pass; duplicate→drag→Save round-trip to be eyeballed in preview.
- 2026-07-20: Filed from user request (feature-rich editing toolbar). Duplicate +
  copy/paste grouped as pure working-set clone operations (no spatial SQL);
  cross-layer paste deferred. Key correctness point: fresh ids, no `__rid`, deep
  clone.
</content>
</invoke>
