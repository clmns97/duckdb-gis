import type { GeometryKind, LayerStyle } from "../lib/layers";

// The little geometry-typed symbology swatch shown before a layer name in the
// Layers panel (T-039 / T-040) — a point layer shows a filled dot with a white
// halo, a line layer a 2px stroked polyline, a polygon a filled+outlined shape,
// each drawn in that layer's own fill/line colours so the panel mirrors what's on
// the map (QGIS's layer-tree symbol preview). Distinct from `TypeGlyph` (column
// data types).
//
// The swatch is 16px (`w-4 h-4 shrink-0`) — it fills the `GLYPH_SLOT` column so
// the layer name aligns with the Browser tree.

const BOX = "w-4 h-4 shrink-0";

const rgb = (c: [number, number, number]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
const rgba = (c: [number, number, number], a: number) =>
  `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

export function SymbologyGlyph({
  kind,
  style,
}: {
  kind?: GeometryKind;
  style?: LayerStyle;
}) {
  // Still loading (no geometry family / style yet) → dashed neutral placeholder
  // at the same size so the row doesn't jump when it resolves.
  if (!kind || !style) {
    return (
      <span
        className={`${BOX} rounded-[3px] border border-dashed border-gray-300`}
        aria-hidden="true"
      />
    );
  }

  const fill = rgb(style.fillColor);
  const line = rgb(style.lineColor);

  return (
    <span className={BOX} aria-hidden="true">
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none">
        {kind === "point" && (
          <circle
            cx="8"
            cy="8"
            r="4"
            fill={fill}
            stroke="var(--color-white)"
            strokeWidth="1.5"
          />
        )}
        {kind === "line" && (
          <path
            d="M2 12L6 5l4 4 4-6"
            stroke={line}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {kind === "polygon" && (
          <rect
            x="2.5"
            y="2.5"
            width="11"
            height="11"
            rx="1.5"
            fill={rgba(style.fillColor, 0.28)}
            stroke={line}
            strokeWidth="1.5"
          />
        )}
      </svg>
    </span>
  );
}
