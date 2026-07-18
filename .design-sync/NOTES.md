# design-sync notes — @duckdb-gis/ui-kit

Storybook-shape sync. Package `design-system/` (`@duckdb-gis/ui-kit`), pnpm,
tsup + Tailwind v4, Storybook 9 (react-vite). Components re-export
`../frontend/src` in place — the frontend is the source of truth.

Build inputs (re-sync):
- `pnpm -C design-system build` (library → dist/) then rebuild sb-reference:
  `cd design-system && npx storybook build -c .storybook -o "$(git rev-parse --show-toplevel)/.design-sync/sb-reference"`
- converter: `--node-modules design-system/node_modules --entry design-system/dist/index.js`
  (in-source repo: no `node_modules/@duckdb-gis/ui-kit`, so `--entry` is required).

## Config decisions (why each knob exists)

- **[GENERAL] titleMap** — two components are exposed via their store-free
  `*View` halves but their story titles drop the suffix: `Panels/DrawToolbar` →
  export `DrawToolbarView`, `Panels/SelectionChip` → `SelectionChipView`.
  Without `titleMap` they're dropped as `[TITLE_UNMAPPED]`.
- **[GENERAL] extraFonts** — the frontend's `tokens.css` names `Inter`
  (`--font-sans`) and `Source Code Pro` (`--font-mono`) first but ships **no**
  `@font-face` (relies on host system fonts). User chose to ship them for
  claude.ai/design. Fonts fetched from the OFL @fontsource registry (Inter
  400/500/600/700, Source Code Pro 400/500) → `.design-sync/fonts/*.woff2` +
  `.design-sync/fonts/fonts.css`, wired via `cfg.extraFonts`. **Re-sync step:**
  the reference storybook has no @font-face either, so the oracle must be
  patched to match — after rebuilding `.design-sync/sb-reference`, copy the
  woff2 into `sb-reference/fonts/` and inject the `@font-face` block into
  `sb-reference/iframe.html` (see the injection snippet in this repo's sync
  history) so both grading panels render real Inter, not chromium fallback.
- **overrides** — overlay/overflow components:
  - `Modal`, `ContextMenu`: `cardMode: "single"` (full-viewport-fixed overlays;
    grid cells can't contain them) + `primaryStory: "Default"` + a card
    `viewport`.
  - `SelectionChipView`: `cardMode: "column"` (stories wider than a grid cell).

## Owned previews

- **`previews/Modal.tsx`** — Modal is a full-viewport `fixed` overlay in a
  `cardMode:single` card, so `.ds-single`'s `transform` becomes its containing
  block; with no in-flow content that block is 0px tall and the vertically
  centered dialog lands off-frame. The owned preview prepends a
  `minHeight: calc(100vh - 48px)` spacer (48px = the card template's stable body
  gutter for `?story=` captures) so `fixed inset-0` fills the frame and the
  dialog centers, matching the storybook reference. Graded `match`. **Risk:** if
  the card template's body padding ever changes from 24px, revisit the `48px`.
  ContextMenu needs no such fix — it's top-left-anchored, so the 0-height block
  doesn't shift it.

## Triaged warnings (not bugs — do not "fix")

- **[RENDER_THIN] Modal, ContextMenu** — these components are entirely
  `position:fixed` (Modal backdrop `fixed inset-0`; ContextMenu `fixed`), so the
  card element has 0px *flow* height even though the content paints correctly
  (verified from the product-card screenshots — dialog + menu both render, in
  Inter). Authoring an owned preview to give artificial flow height would
  misrepresent them as non-fixed and diverge from the storybook oracle. Accept.

## Re-sync risks

- **Fonts (highest risk):** sb-reference is gitignored + rebuilt each sync and
  loses the injected `@font-face`. If you skip the injection step above, the
  oracle falls back to system fonts while the previews ship Inter — grading will
  then read a false font mismatch. Always re-inject after rebuilding sb-reference.
- The two `*View` components are the store-free halves of store-connected
  components; if the frontend renames them, update `titleMap`.
- **Tailwind v4 tree-shakes theme custom properties to what's used.** A token
  defined in `tokens.css` `@theme` only lands in the closure if some component
  uses its utility (or `var(--…)`) — otherwise it's absent, and any
  `conventions.md`/snippet reference to it silently resolves to nothing. The
  2026-07-18 GIS redesign (flat pass) dropped the last users of `--radius-md`
  (4px), `--color-gray-700`, and all `shadow-sm/md` utilities, so those fell out
  of `_ds_bundle.css`. `conventions.md` was corrected on the 2026-07-18 re-sync
  (radii list, elevation line, neutrals list, and the input snippet's
  `borderRadius` → `var(--radius-sm)`). **On every re-sync, re-grep the built
  `ds-bundle/{styles,_ds_bundle}.css` for each token/utility `conventions.md`
  names** — a name that no longer resolves is drift to fix, not to ship.
