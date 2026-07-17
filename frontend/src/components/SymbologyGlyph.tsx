import type { GeometryKind, LayerStyle } from "../lib/layers";

// The little geometry-typed symbology swatch shown before a layer name in the
// Layers panel (T-039) — a point layer shows a filled dot, a line layer a
// stroke, a polygon layer a filled outlined square, each drawn in that layer's
// own fill/line colours so the panel mirrors what's on the map (QGIS's
// layer-tree symbol preview). Distinct from `TypeGlyph` (column data types).
//
// The swatch itself is a fixed 12px (`w-3 h-3 shrink-0`); the caller centers it in
// the wider `GLYPH_SLOT` column so the layer name aligns with the Browser tree.

const BOX = "w-3 h-3 shrink-0";

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
  // Still loading (no geometry family / style yet) → neutral placeholder at the
  // same size so the row doesn't jump when it resolves.
  if (!kind || !style) {
    return (
      <span
        className={`${BOX} rounded-[3px] bg-gray-200 border border-gray-300`}
        aria-hidden="true"
      />
    );
  }

  const fill = rgba(style.fillColor, style.fillOpacity);
  const line = rgb(style.lineColor);

  return (
    <span className={BOX} aria-hidden="true">
      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
        {kind === "point" && (
          <circle cx="6" cy="6" r="3.5" fill={fill} stroke={line} strokeWidth="1" />
        )}
        {kind === "line" && (
          <line
            x1="1.5"
            y1="10.5"
            x2="10.5"
            y2="1.5"
            stroke={line}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        )}
        {kind === "polygon" && (
          <rect
            x="1.5"
            y="1.5"
            width="9"
            height="9"
            rx="1"
            fill={fill}
            stroke={line}
            strokeWidth="1"
          />
        )}
      </svg>
    </span>
  );
}
