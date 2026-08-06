---
id: T-042
title: Batch (and dirty-track) the edit-in-place commit writes
status: done
priority: P2
area: frontend
depends_on: [T-038]
branch:
---

## Goal

Saving edits to an existing layer should be one (or a few) SQL statements, not
one round-trip per feature. Today a user who nudges a single vertex on a layer
loaded with N features triggers up to N sequential `UPDATE`s. After this work,
committing edits to an existing layer costs a small constant number of
round-trips regardless of feature count, and untouched features are not
rewritten at all.

## Context

<context>
Introduced in T-038 (feature editing as an explicit mode). The existing-layer
commit path in `frontend/src/lib/editing.ts` (`commit()`, around
`editing.ts:374`) writes the working set back to the source table by `rowid`
inside a transaction:

- `editing.ts:400` `BEGIN TRANSACTION`
- `editing.ts:402` `for (const f of features)` — issues one `await query()`
  (`UPDATE … WHERE rowid = …` or `INSERT …`) **per feature**.
- `editing.ts:412` `for (const rid of loadedRids)` — one `DELETE … WHERE
  rowid = …` per removed row.

Two problems:
1. **No dirty-tracking.** Every feature whose `__rid` is in `loadedRids` is
   `UPDATE`d unconditionally, even if the user never touched it. `beginEdit`
   loads *all* rows (up to `EDIT_CAP = 2000`) into the working set, so a save
   after moving one vertex on a 2000-feature layer fires ~2000 `UPDATE`s.
2. **N round-trips.** `query()` is not a cheap in-process call — it's a
   SQL-over-HTTP request (`@duckdb/ui-client` → Vite proxy → `start_gis`
   server, see `lib/duckdb.ts:7,19-22`). Each `await query()` is a real HTTP
   round-trip, run sequentially.

Cheaper shape:
- **Batch** the writes: multi-row `INSERT … VALUES (…),(…)`, `DELETE … WHERE
  rowid IN (…)`, and a batched `UPDATE t SET geom = v.g FROM (VALUES …)
  v(rid, g) WHERE t.rowid = v.rid`. That collapses ~2000 round-trips to ~3.
- **Dirty-track** so only changed features are written. Terra Draw fires
  per-feature `change`/`finish` events (already wired at `editing.ts` `draw.on
  ("change", refresh)` / `draw.on("finish", refresh)`); record which feature
  ids actually changed and only `UPDATE` those rids.

Watch for: SQL literal escaping already goes through the shared
`sqlLit` (`lib/duckdb.ts:35`); geometry is built as
`ST_GeomFromGeoJSON('<sqlLit(JSON.stringify(geom))>')`. Keep the single
transaction with the existing best-effort `ROLLBACK` on error. The `new`-layer
branch of `commit()` is unaffected (single `CREATE TABLE AS … VALUES`).

Surfaced by the T-038 `/simplify` review (efficiency angle) as the top finding;
deferred as too substantive for a quality-only pass.
</context>

## Acceptance criteria

- [x] Existing-layer commit issues O(1) statements (batched INSERT / UPDATE /
      DELETE), not one per feature.
- [x] Only features the user actually edited are `UPDATE`d; untouched loaded
      features are left alone.
- [x] Deletions and new draws still write back correctly by `rowid`.
- [x] Still a single transaction with rollback on failure.
- [x] `new`-layer commit behavior unchanged.
- [x] Frontend `tsc --noEmit` passes; edit → save round-trips verified against
      a real layer.

## Progress log

- 2026-07-20: Filed from T-038 /simplify review (efficiency finding).
- 2026-07-20: Done alongside the T-038 toolbar rework. Added a `dirty` set in
  `editing.ts` fed by Terra Draw's `change` event (ids that actually changed),
  reset on begin/finish/destroy and after the initial `addFeatures` load so a
  freshly loaded set counts as untouched. `commit()`'s existing-layer branch now
  partitions the working set once and issues a constant number of batched
  statements inside the same transaction (+ best-effort rollback): one multi-row
  `INSERT`, one `UPDATE … FROM (VALUES …) v(rid,g) WHERE rowid = v.rid` limited to
  dirty rows, one `DELETE … WHERE rowid IN (…)`. Untouched loaded rows are never
  rewritten. Verified the batched shape against DuckDB spatial (correct
  id→geometry diff, deletions/inserts land, untouched rows skipped); the
  `new`-layer `CREATE TABLE AS … VALUES` branch is unchanged. Frontend
  `tsc --noEmit` + `build` pass.
