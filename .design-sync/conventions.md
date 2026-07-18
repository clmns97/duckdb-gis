## Building with the duckdb-gis UI kit

Presentational components for **duckdb-gis** — a browser GIS tool (QGIS-style
Layers/Browser panels, map symbology) with DuckDB as the engine. **Light theme
only.** The look is flat, near-square, gray-on-hover, indigo-accent, Lucide icons.

### Setup — no provider needed

Components are self-contained: **no theme provider, context, or root wrapper.**
Render any component directly; it styles itself from `styles.css` (already loaded
in every design). Fonts — **Inter** (text) and **Source Code Pro** (mono / file
paths) — ship inside the `styles.css` `@import` closure, so nothing to add.

Available components: `Button`, `Modal` (+ `FieldLabel`, `ModalNote`),
`ContextMenu`, `TypeGlyph`, `SymbologyGlyph`, `OvertureLogo`, `SelectionChipView`,
`DrawToolbarView`.

### Styling idiom — tokens, not arbitrary utilities

Two layers, and the distinction matters:

1. **Library components are already styled.** Compose them and pass props
   (`variant`, `kind`, `count`, `style`…). Don't add utility classes to restyle
   them.

2. **For your own layout glue, style with the design tokens — not ad-hoc
   Tailwind.** This kit is built with Tailwind v4 but ships a *compiled,
   source-scanned* stylesheet: only the utility classes the components already
   use exist in it. Arbitrary classes like `bg-blue-500`, `p-8`, `grid-cols-3`,
   `text-2xl` are **not** in the bundle and silently do nothing. The reliable,
   complete vocabulary is the **design tokens**, all defined as CSS custom
   properties in the closure — reference them via `var(--…)` (inline `style` or
   your own CSS):

   - **Type:** `--font-sans`, `--font-mono`; sizes `--text-xs` 11px, `--text-sm`
     12px, `--text-editor` 13px, `--text-base` 14px, `--text-lg` 16px;
     `--font-weight-medium` 500.
   - **Neutrals:** `--color-gray-100` (the universal hover fill) · `-200`
     (borders/dividers) · `-300` (disabled) · `-400` · `-500` (muted / icons) ·
     `-600` · `-900` (primary text); `--color-white`; `--color-hairline`
     (input/menu borders).
   - **Accent (indigo):** `--color-accent` #494ab9 (links, active) ·
     `--color-primary` #6366f1 (primary CTA) · `--color-primary-border-active`.
   - **Surfaces / status:** `--color-subtle` (active tint) · `--color-bg` ·
     `--color-bg-subtle` · `--color-border` · `--color-text` ·
     `--color-text-muted` · `--color-danger` (error) · `--color-success` (teal) ·
     `--color-grid-cell`.
   - **Brand:** `--color-duck-yellow`, `--color-brand-orange`.
   - **Radii:** `--radius-sm` 2px (buttons/inputs), `--radius-lg` 6px (cards/menus).
     The kit is deliberately flat — 4px (`--radius-md`) is unused and **not** in
     the closure. **Elevation:** none — no shadow utilities or tokens ship;
     separate surfaces with borders (`--color-gray-200` / `--color-hairline`).

### Where the truth lives

Read the shipped `styles.css` (it `@import`s `fonts.css` + `_ds_bundle.css` — the
compiled tokens and component styles) before styling. Per component, read its
`<Name>.prompt.md` (usage) and `<Name>.d.ts` (`<Name>Props`).

### One idiomatic build snippet

```tsx
// Layout glue via tokens; controls from the library.
<div style={{ font: "var(--text-base)/1.4 var(--font-sans)", color: "var(--color-text)", padding: 16 }}>
  <Modal title="Attach database" onClose={close} footer={
    <>
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={attach}>Attach</Button>
    </>
  }>
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <FieldLabel>Path</FieldLabel>
      <input defaultValue="/data/city.duckdb"
        style={{ border: "1px solid var(--color-hairline)", borderRadius: "var(--radius-sm)",
                 padding: "4px 8px", font: "var(--text-editor) var(--font-mono)" }} />
    </label>
    <ModalNote>Attaches the file as a read-only catalog.</ModalNote>
  </Modal>
</div>
```
