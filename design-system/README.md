# @duckdb-gis/ui-kit

The frontend's **isolation-safe presentational components**, packaged as a
compiled library + Storybook. Two purposes:

1. **Fast iteration** — look at and tweak a single component in Storybook with no
   map / DuckDB / dock boot (`pnpm storybook`).
2. **claude.ai/design (design-sync)** — a clean component library a `/design-sync`
   run can import so the design agent builds new screens out of *our* components
   on *our* tokens. See the skipped straight-sync note in `T-040`.

## Source of truth stays in the frontend

This package **imports `../frontend/src` in place** — it does not copy or fork
anything. `src/index.ts` re-exports the components; `src/styles.css` pulls in the
canonical `frontend/src/lib/tokens.css` (same `@theme` the app ships) and
`@source`-scans the components so Tailwind generates exactly their utilities.
Edit a component in `frontend/`, rebuild here, and the kit + stories follow.

Only presentational, low-coupling components are exposed. Map/DuckDB/dock-coupled
components (`MapView`, `Dock`, the attach/overture dialogs) are excluded. The two
store-connected pieces are exposed via their store-free `*View` halves
(`SelectionChipView`, `DrawToolbarView`); the store-connected `SelectionChip` /
`DrawToolbar` the app renders live beside them in `frontend/src/components`.

## Commands

```sh
pnpm install         # once (allows esbuild/@parcel/watcher build scripts)
pnpm storybook       # dev Storybook on :6006
pnpm build           # library → dist/ (index.js ESM, index.d.ts, styles.css)
pnpm typecheck       # tsc --noEmit
pnpm build-storybook # static Storybook → storybook-static/
```

## Layout

```
src/index.ts     public exports (re-export ../frontend/src in place)
src/styles.css   @import tailwindcss + tokens.css; @source the components
src/stories/     one story per exported component
.storybook/      react-vite + @tailwindcss/vite, React deduped
tsup.config.ts   library build (React externalised)
```
