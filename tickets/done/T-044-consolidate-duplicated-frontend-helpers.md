---
id: T-044
title: Consolidate duplicated frontend helpers (modal INPUT, sqlLit)
status: open
priority: P3
area: frontend
depends_on: []
branch:
---

## Goal

Two helpers are copy-pasted across several frontend modules; each future tweak
has to be made in every copy. Fold them into their shared homes so there is one
source of truth.

## Context

<context>
Surfaced by the T-038 `/simplify` review (reuse angle). T-038 fixed the one
copy it introduced (`sqlLit` now exported from `lib/duckdb.ts:35` and imported by
`editing.ts`); the pre-existing copies remain and are out of that diff's scope.

**1. Modal text-input className.** The identical Tailwind string

    "text-editor text-gray-900 px-2 py-1.5 bg-white border border-gray-200 rounded-sm focus:outline-none focus:border-primary"

is duplicated at:
- `components/NewLayerModal.tsx:11` (`INPUT` const)
- `components/AttachModal.tsx:12` (`INPUT` const)
- `components/OvertureModal.tsx:102` (inline, minus the `focus:` part)

`components/Modal.tsx` already exports the shared field primitives `FieldLabel`
and `ModalNote` these modals use — hoist the input there (as an exported `INPUT`
const or a small `TextInput` component) and import it in all three.

**2. `sqlLit` SQL-literal escaper.** `sqlLit(v) => v.replace(/'/g, "''")` now
lives canonically at `lib/duckdb.ts:35`, but identical private copies remain at:
- `lib/layers.ts:429`
- `lib/attach.ts:39`

Point both at the shared `sqlLit` from `lib/duckdb.ts` and delete the local
copies. (Check `lib/tiles.ts` too — the review noted an inline variant there.)

Both are pure mechanical de-duplication; no behavior change intended.
</context>

## Acceptance criteria

- [x] The modal input className lives in one place (`Modal.tsx`) and
      `NewLayerModal`, `AttachModal`, and `OvertureModal` all use it.
- [x] `layers.ts`, `attach.ts` (and any `tiles.ts` variant) import `sqlLit`
      from `lib/duckdb.ts`; no local copies remain.
- [x] No visual or behavioral change; frontend `tsc --noEmit` passes.

## Progress log

- 2026-07-20: Filed from T-038 /simplify review (reuse finding).
- 2026-07-20: Done alongside the T-038 toolbar rework. Exported `INPUT` from
  `Modal.tsx`; `NewLayerModal`/`AttachModal` import it and `OvertureModal`'s
  release `<select>` uses it too (the three local/inline copies deleted). `sqlLit`
  now imported from `lib/duckdb.ts` in `layers.ts` and `attach.ts` (local copies
  deleted); `tiles.ts` `sqlStr` delegates its escaping to the shared `sqlLit`.
  Frontend `tsc --noEmit` + `build` and design-system `typecheck` pass; pure
  mechanical de-dup, no behavior change.
