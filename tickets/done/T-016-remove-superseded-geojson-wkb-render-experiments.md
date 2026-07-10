---
id: T-016
title: Remove superseded GeoJSON/WKB render-path experiment leftovers
status: done
priority: P2
area: frontend
depends_on: []
branch:
---

## Goal

The frontend settled on the GeoArrow render path (`deckRender.ts`), but the
earlier GeoJSON and raw-WKB prototypes it beat are still in the tree as dead
code, a benchmark harness, and stale comments that point at a file that no
longer exists. Done means the superseded experiment code is removed (or, for
the benchmark, a deliberate keep/remove decision is made) and the remaining
comments describe the code that actually exists.

## Context

<context>
Production render path is GeoArrow: `frontend/src/lib/deckRender.ts`
(`renderGeoArrow`), wired into the Run button (`EditorPanel.tsx:24`). The
alternatives it replaced are still present:

1. **Dead WKB parser** — `frontend/src/lib/wkb.ts`:
   - `parseWKB` (`wkb.ts:37`) and its helpers `readGeom`/`readXY`/`readRing`/
     `readPolygon`/`readMany` (`wkb.ts:42-98`) plus the `ParsedGeom`/`Ring`/
     `Cursor` types are **never imported anywhere** (grep confirms). The file's
     own header calls it "the deck.gl render path (option 2 prototype)".
   - The only live export is `wkbPointsToPositions` (`wkb.ts:11`), used solely
     by the benchmark (`bench.ts:4,72`). So if the benchmark goes, all of
     `wkb.ts` goes.

2. **Benchmark harness comparing dead paths** — `frontend/src/lib/bench.ts` +
   `frontend/bench.mjs` + the `window.gisDeck.runBenchmark` dev seam
   (`App.tsx:46`). It measures GeoJSON vs WKB vs Arrow to justify the render
   choice; that decision is made. It benchmarks a "current GeoJSON path" that
   is no longer the production path.

3. **Stale comments referencing a deleted `render.ts`** — there is no
   `render.ts` in the tree, but comments still cite it / "the current GeoJSON
   path":
   - `bench.ts:6` ("the current GeoJSON path") and `bench.ts:46`
     ("Replicates render.ts")
   - `wkb.ts:8` ("the per-feature JSON.parse the GeoJSON path pays")
   - `tiles.ts:171` ("mirrors the GeoJSON path")

### Suggested remediation
- Delete `parseWKB` + helpers + unused types from `wkb.ts` unconditionally
  (high confidence: dead).
- Decide on the benchmark: if it is no longer needed as a dev tool, delete
  `bench.ts`, `frontend/bench.mjs`, the `runBenchmark` import + `gisDeck` seam
  entry in `App.tsx`, and the now-orphaned `wkb.ts` entirely. If kept, move it
  somewhere clearly marked as dev-only and fix its comments.
- Update/remove the stale `render.ts` / "GeoJSON path" comments so they match
  the GeoArrow reality.

Confidence: (1) high, (3) high; (2) is a judgment call (dev tooling) — flagged,
not prescribed.
</context>

## Acceptance criteria

- [x] `parseWKB` and its unused helpers/types are gone from `wkb.ts`.
- [x] Benchmark harness either removed (incl. `bench.mjs`, `App.tsx` seam) or
      relocated + relabelled dev-only, with a note in the Progress log saying
      which and why.
- [x] No remaining comment references a non-existent `render.ts` / "current
      GeoJSON path".
- [x] `pnpm --dir frontend typecheck` passes.

## Progress log

- 2026-07-10: Filed by T-013 audit. Verified `parseWKB` has zero importers and
  `render.ts` does not exist.
- 2026-07-10: Decision: REMOVE the benchmark harness entirely. It benchmarked
  GeoJSON vs WKB vs Arrow render paths purely to justify the render-path choice;
  that decision is settled (production is the GeoArrow path in `deckRender.ts`),
  so the harness has no ongoing value as a dev tool and only carried stale
  references to a deleted `render.ts` / "current GeoJSON path". Removed:
    - `frontend/src/lib/bench.ts` (deleted)
    - `frontend/bench.mjs` (deleted)
    - `frontend/src/lib/wkb.ts` (deleted entirely — its only live consumer was
      `bench.ts` via `wkbPointsToPositions`; `parseWKB` + helpers were already
      dead)
    - `App.tsx`: removed `import { runBenchmark } from "./lib/bench"` and the
      `runBenchmark` entry from the `window.gisDeck` dev seam (kept
      `renderGeoArrow`, `clearDeck`).
  Also reworded the stale comment at `tiles.ts:171` (was "mirrors the GeoJSON
  path") to describe the actual behaviour: one style layer per geometry family
  filtered on `$type` because a tile may mix geometry types. No behaviour change.
  Grep of `frontend/` afterwards: no surviving references to the removed
  benchmark/WKB code or to `render.ts` / "GeoJSON path". Remaining hits are
  legitimate and unrelated — `tiles.ts:8` references the real `deckRender.ts`
  file (substring "Render.ts"), `tiles.ts:13` cites a "GeoJSON vs ST_AsMVT
  BENCHMARK" design-rationale note in project memory, and `deckRender.ts`'s
  `wkbBytes` helper is production Arrow-IPC byte extraction. `pnpm typecheck`
  (`tsc --noEmit`) passes. Not committed — parent will commit.
