import type { ReactNode } from "react";
import { Calendar, Check, Type as TypeIcon } from "lucide-react";
import { typeKind, type TypeKind } from "../lib/columnTypes";

// The little data-type glyph shown before a column name — DuckDB's grid uses a
// filled 16px set (123 / # / T / △ …). We render the numeric/text ones as tiny
// mono text and the rest as Lucide icons, all in a fixed 16px box so column
// headers and schema rows align. Accepts either a raw DuckDB type or a TypeKind.

const BOX = "inline-flex w-4 h-4 shrink-0 items-center justify-center text-gray-500";

function TextGlyph({ children }: { children: string }) {
  return (
    <span className={BOX} aria-hidden="true">
      <span className="font-mono text-[9px] leading-none tracking-tight">{children}</span>
    </span>
  );
}

/** A small polygon/triangle for GEOMETRY columns (accent-tinted). */
function GeometryGlyph() {
  return (
    <span className={`${BOX} text-accent`} aria-hidden="true">
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <polygon points="8,2.5 14,13.5 2,13.5" />
      </svg>
    </span>
  );
}

export function TypeGlyph({ type, kind, title }: { type?: string; kind?: TypeKind; title?: string }) {
  const k = kind ?? typeKind(type);
  const label = title ?? type ?? k;
  const wrap = (node: ReactNode) => <span title={label}>{node}</span>;
  switch (k) {
    case "int":
      return wrap(<TextGlyph>123</TextGlyph>);
    case "float":
      return wrap(<TextGlyph>#</TextGlyph>);
    case "text":
      return wrap(<TextGlyph>T</TextGlyph>);
    case "geometry":
      return wrap(<GeometryGlyph />);
    case "temporal":
      return wrap(<span className={BOX}><Calendar size={13} strokeWidth={2} /></span>);
    case "bool":
      return wrap(<span className={BOX}><Check size={14} strokeWidth={2} /></span>);
    default:
      return wrap(<span className={BOX}><TypeIcon size={13} strokeWidth={2} /></span>);
  }
}
