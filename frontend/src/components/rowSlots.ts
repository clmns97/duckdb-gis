// Shared column template for sidebar list rows (T-037). The Layers panel rows,
// the pinned basemap row, and the Browser catalog tree rows all use the same
// fixed-width slots — a leading icon, a symbology-glyph slot, the flexible name,
// then a trailing ⋮ actions column — so the leading glyphs and the ⋮ kebabs line
// up across every panel. A row lacking a given control renders an empty spacer of
// the same width to hold the column. Any future pinned/tree row reuses these.
// Shared row container: the invariant that makes rows across panels line up
// (height, item centering, gap, right pad, hover fill). Each row appends its own
// left pad / `group` / cursor / selection-state classes.
export const ROW_BASE = "flex items-center gap-1.5 h-7 pr-1 text-editor hover:bg-gray-100";

export const LEAD_SLOT = "w-4 h-4 shrink-0 grid place-items-center"; // eye toggle / basemap / tree icon
export const GLYPH_SLOT = "w-4 h-4 shrink-0 grid place-items-center"; // symbology glyph (w-3 swatch, centered) / spacer
export const KEBAB_SLOT =
  "w-6 h-6 grid place-items-center shrink-0 rounded text-gray-400 cursor-pointer hover:bg-white hover:text-gray-900";
export const REMOVE_SLOT = "w-4 h-4 shrink-0"; // X-remove button / spacer
