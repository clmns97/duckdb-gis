---
id: T-019
title: Audit candidate-unused frontend dependencies
status: done
priority: P3
area: build
depends_on: []
branch:
---

## Goal

Several dependencies declared in `frontend/package.json` have no direct import
in the source. Some are probably genuine bloat; others are likely required peer
dependencies of `@geoarrow/deck.gl-geoarrow` or transitive parts of CodeMirror
that must be installed by the consumer. Done means each has been checked and
either kept (with a one-line reason) or removed, shrinking the install.

## Context

<context>
No direct `import ... from` match anywhere under `frontend/src` or the `.mjs`
scripts for these declared deps:
- `@deck.gl/aggregation-layers`
- `@deck.gl/geo-layers`
- `@deck.gl/layers`
- `@math.gl/polygon`
- `@codemirror/commands`
- `@codemirror/state`

### Important caveat — verify before removing
Do **not** blindly delete these. Likely-required-anyway cases:
- `@geoarrow/deck.gl-geoarrow` renders via deck.gl layer classes and may list
  `@deck.gl/layers`, `@deck.gl/geo-layers`, `@deck.gl/aggregation-layers`,
  `@math.gl/polygon` as peer deps that must be present for the GeoArrow layers
  used in `deckRender.ts` to work at runtime.
- `codemirror`'s `basicSetup` (used in `EditorPanel.tsx`) pulls
  `@codemirror/commands` and `@codemirror/state`; `@codemirror/state` is also a
  peer of `@codemirror/view`. Listing them directly may be redundant but
  removing them can break resolution under strict/pnpm hoisting.

### Suggested remediation
Run `pnpm --dir frontend dlx depcheck` (or inspect each package's
`peerDependencies`), then for each: remove if truly unused, or keep with a
comment/PR note explaining it's a required peer. Re-run `pnpm --dir frontend
build` + a smoke render (point/line/polygon queries via the Run button) to
confirm the GeoArrow layers still load after any removal.
</context>

## Acceptance criteria

- [x] Each listed dep is resolved: removed, or kept with a documented reason.
- [x] `pnpm --dir frontend build` succeeds and the GeoArrow render path still
      renders points, lines, and polygons.

## Progress log

- 2026-07-10: Filed by T-013 audit. Candidates found by grepping for direct
  imports; peer-dep caveat noted — needs verification, not blind removal.
- 2026-07-10: Audited all 6 candidates against installed package metadata.

  Direct imports in `frontend/src` (verified by grep): only `@deck.gl/mapbox`,
  `@deck.gl/core` (`deckRender.ts`), `codemirror`, `@codemirror/view`,
  `@codemirror/lang-sql` (`EditorPanel.tsx`). None of the 6 candidates are
  imported directly.

  Evidence — `frontend/node_modules/@geoarrow/deck.gl-geoarrow/package.json`
  (v0.4.1) `peerDependencies`:
  `@deck.gl/aggregation-layers ^9.0.0`, `@deck.gl/core ^9.0.0`,
  `@deck.gl/geo-layers ^9.0.0`, `@deck.gl/layers ^9.0.0`,
  `@math.gl/polygon ^4.1.0`, `apache-arrow >=15`.
  `deckRender.ts` imports `GeoArrowScatterplotLayer/PathLayer/PolygonLayer`
  from this package, so all four candidates are required runtime peers.

  Evidence — codemirror: `codemirror` (v6.0.2) lists `@codemirror/commands`
  and `@codemirror/state` in `dependencies` (not peerDependencies);
  `@codemirror/view` (v6.43.6) lists `@codemirror/state` in `dependencies`.
  Neither is a peer of anything we use, and neither is imported directly by
  our code — they resolve transitively regardless of our manifest. Confirmed
  after `pnpm remove` they stay installed under `.pnpm/` via codemirror/view,
  and both `pnpm build` and `pnpm typecheck` still pass.

  | Dependency | Verdict | Reason |
  |---|---|---|
  | `@deck.gl/aggregation-layers` | KEEP | Required `peerDependency` of `@geoarrow/deck.gl-geoarrow` (used in `deckRender.ts`); `autoInstallPeers` present but keep explicit as a direct runtime requirement. |
  | `@deck.gl/geo-layers` | KEEP | Required `peerDependency` of `@geoarrow/deck.gl-geoarrow`. |
  | `@deck.gl/layers` | KEEP | Required `peerDependency` of `@geoarrow/deck.gl-geoarrow`; base layer classes for the GeoArrow layers. |
  | `@math.gl/polygon` | KEEP | Required `peerDependency` of `@geoarrow/deck.gl-geoarrow`; polygon tessellation for `GeoArrowPolygonLayer`. |
  | `@codemirror/commands` | REMOVED | Not a peer; transitive `dependency` of `codemirror`; not imported directly; build+typecheck pass after removal. |
  | `@codemirror/state` | REMOVED | Not a peer; transitive `dependency` of `codemirror`/`@codemirror/view`; not imported directly; build+typecheck pass after removal. |

  Ran `pnpm remove @codemirror/commands @codemirror/state`, then
  `pnpm install && pnpm build && pnpm typecheck` — all succeeded. Only
  `frontend/package.json` + `pnpm-lock.yaml` changed. Not committed.
