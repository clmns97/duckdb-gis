---
id: T-036
title: Investigate & fix slow Overture cold-start (~70s for a viewport)
status: open
priority: P2
area: frontend
depends_on: [T-012]
branch:
---

## Goal

Understand *why* the first Overture load of a theme takes ~70s — and get it to a
sensible interactive time. Fetching a few thousand features from a bbox should
not take a minute; either there's a fixable inefficiency in how we read, or it's
an environmental (network) artifact of the host we benchmarked on. Resolve which,
then fix or document it.

## Context

<context>
Reported while testing T-034. Loading an Overture theme (Transportation / Places)
onto the map is slow the first time, fast afterwards. The user is (rightly)
skeptical that a few-thousand-feature bbox read should take ~a minute, and wants
to re-measure on their own machine and compare against QGIS (which also has an
Overture plugin) before we accept the root cause.

### What we currently do (matches Overture's own docs)

`buildOvertureQuery` (`frontend/src/lib/overture.ts:113-122`) →
`SELECT geometry::GEOMETRY AS geom FROM read_parquet('s3://overturemaps-us-west-2/
release/<rel>/theme=<t>/type=<ty>/*', hive_partitioning=1) WHERE bbox.xmin <=
xmax AND bbox.xmax >= xmin AND bbox.ymin <= ymax AND bbox.ymax >= ymin`.
`App.loadOverture` materializes that into a TEMP table once, then renders.

Verified against Overture's DuckDB guide (https://docs.overturemaps.org/getting-
data/duckdb/, read 2026-07-16): same `theme=/type=/*` glob, same `bbox` struct
predicate, same `hive_partitioning=1`, same "materialize first" tip. Their
examples just also `SELECT` the attribute columns (→ T-035) and use `SET
s3_region='us-west-2'` instead of our scoped anonymous SECRET (ours is deliberate,
see `lib/remote.ts`). **The docs offer no spatial index, no `_metadata` file, and
no way to read fewer than all files** — every example globs `/*`.

### Measurements (host: the dev VPS, network path VPS → S3 us-west-2)

Central-Berlin extent (~5×4 km), anonymous S3 + `enable_object_cache=true`.

| query | features matched | cold | warm |
|-------|------------------|------|------|
| transportation (segment), Berlin bbox | 20,402 | 69 s | 3.1 s |
| transportation, **mid-Pacific bbox (no match)** | ~2 | **71 s** | 3.1 s |
| places (place), Berlin bbox | 25,891 | 14 s | ~3 s |

Partition `theme=transportation/type=segment/` = **128** `part-*.zstd.parquet`
files. No `_metadata` sidecar (a `*metadata*` glob returns 0 rows; direct read
404s). Glob LIST of the prefix is fast (~0.8s).

### The crux (why we currently believe it's metadata, not data)

The **no-match** query (matched ~2 rows, ≈0 data) cost the SAME ~71s cold as the
20k-row query. So cold time is independent of how much data matches → it is not
scanning feature data. Working hypothesis: to use the per-row-group `bbox`
statistics, DuckDB must open the **footer of all 128 files** first (128 ranged S3
GETs, RTT-bound, limited parallelism ≈ 68s), then prunes to a few row groups and
reads their data (the ~3s warm number). `enable_object_cache` caches those footers
in-process → 3s on the second query.

### Why the user is still skeptical (open questions to resolve)

- 128 footer reads = ~68s implies ~0.5s/footer with little parallelism. That
  feels too slow — is httpfs serializing these? Would more threads /
  `http_keep_alive` / a higher connection limit collapse it? (Untested.)
- The benchmark ran on the **VPS**, not the user's machine. The VPS ↔ S3
  us-west-2 RTT / bandwidth may be the real culprit. Re-measure at home.
- How does **QGIS's Overture plugin** compare on the same extent/network? If it's
  fast, how? (Different endpoint? Bounded file list? Its own index? The Overture
  CLI / DuckDB under the hood with different settings?) This is the most useful
  external comparison.

### Candidate fixes (once root cause is confirmed)

1. **Tune httpfs concurrency** — try `SET threads`, keep-alive, and any httpfs
   connection-count knob; re-measure the cold footer pass. Cheapest if it helps.
2. **Per-file bbox manifest** — read all 128 footers ONCE (via `parquet_metadata`)
   to build a small `file → xmin/ymin/xmax/ymax` table, persisted on disk; then
   each viewport reads only the handful of overlapping files. Overture files are
   sorted by a space-filling curve, so per-file bbox is very selective (a viewport
   likely hits 1-3 of 128 files). Persists across restarts (unlike the in-memory
   object cache), so the ~70s is paid once ever per release. Goes beyond the docs.
3. **Accept + mask** — if it's just VPS↔S3 latency and is fine on real machines,
   document it and improve perceived latency only (T-035 background prefetch,
   spinner). No code fix to the read itself.

Related: T-035 (Overture attributes — background prefetch). Note the interaction:
because cold time is footer-dominated and column-independent, fetching attributes
in the *same* cold query adds little cold time; the two-pass prefetch's first-paint
win is mainly on WARM loads. If T-036 kills the cold-start, T-035 could simplify to
the docs' single-pass "select geom + attributes" — recorded there too.
</context>

## Acceptance criteria

- [ ] Root cause confirmed with numbers on a non-VPS machine (footer metadata pass
      vs network latency vs httpfs serialization), and cross-checked against
      QGIS's Overture plugin on the same extent.
- [ ] Either: cold-start reduced to an interactive time (target: a viewport load
      in a few seconds, not ~70s), or: a written conclusion that it's an
      environmental artifact acceptable on real networks (with the QGIS comparison
      as evidence).
- [ ] If a fix ships: `pnpm --dir frontend typecheck` + `build` pass; exercised in
      the preview on transportation + places.

## Progress log

- 2026-07-16: Opened from T-034/T-035 testing. Recorded the benchmark evidence
  (table above), the 128-file / no-`_metadata` partition shape, the no-match test
  (cold time is data-independent → points at the footer metadata pass), and the
  Overture-docs comparison (our read matches their recommended pattern; they offer
  no cold-start remedy). OPEN: user to re-measure at home and compare to the QGIS
  Overture plugin before we accept the metadata-pass root cause; then decide
  between httpfs tuning, a per-file bbox manifest, or documenting it as
  environmental. All measurements so far are from the dev VPS (VPS → S3 us-west-2),
  which may itself be the bottleneck.
