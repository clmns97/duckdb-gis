import type { ReactElement, ReactNode } from "react";
import type { EditMode } from "../lib/editing";

// Presentational digitizing toolbar (T-025 / T-040), QGIS-style: a segmented
// icon toolbar (the QGIS "digitising" bar) rather than text-label buttons. Pick
// a draw mode, then Delete / Commit the working set. Prop-driven and store-free,
// so it renders in isolation (Storybook / design-sync / the UI kit) with no
// Terra Draw or map. The store-connected `DrawToolbar` wraps this and wires it
// to the `editing` store. `EditMode` is a type-only import, so the runtime
// editing graph (terra-draw, deck, the map) is never pulled in here.

// --- Icons ------------------------------------------------------------------
// Custom 24×24 stroked glyphs (round caps/joins) lifted from the corrected DC
// spec. Line/polygon keep white vertex handles: they signal editable nodes, so
// they must not collapse to a plain Lucide polyline.

const ICON = 17;

type IconProps = { size?: number };

const svgProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// A white square vertex handle centred on (cx, cy) — the "editable node" marker.
function Vertex({ cx, cy }: { cx: number; cy: number }) {
  return (
    <rect
      x={cx - 1.7}
      y={cy - 1.7}
      width="3.4"
      height="3.4"
      rx="0.5"
      fill="var(--color-white)"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  );
}

function SelectIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 4l7 16 2.5-6.5L20 11z" />
    </svg>
  );
}

function PointIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function LineIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M5 18l5-8 4 4 5-10" />
      <Vertex cx={5} cy={18} />
      <Vertex cx={20} cy={8} />
    </svg>
  );
}

function PolygonIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 3l8 6-3 9H7L4 9z" />
      <Vertex cx={12} cy={3} />
      <Vertex cx={20} cy={9} />
      <Vertex cx={7} cy={18} />
    </svg>
  );
}

function DeleteIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

function CheckIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}

function AlertIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps} className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function Spinner({ size = ICON }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...svgProps}
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" opacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

// --- Layout helpers ---------------------------------------------------------

const MODES: Array<{
  mode: Exclude<EditMode, "static">;
  title: string;
  Icon: (p: IconProps) => ReactElement;
}> = [
  { mode: "select", title: "Select & edit vertices (V)", Icon: SelectIcon },
  { mode: "point", title: "Draw points (P)", Icon: PointIcon },
  { mode: "line", title: "Draw lines (L)", Icon: LineIcon },
  { mode: "polygon", title: "Draw polygons (G)", Icon: PolygonIcon },
];

const MODE_LABEL: Record<EditMode, string> = {
  static: "READY",
  select: "SELECT",
  point: "POINT",
  line: "LINE",
  polygon: "POLYGON",
};

// A 34×34 near-square tool button; `on` gives it the active (indigo) tint.
function ToolButton({
  title,
  on,
  onClick,
  children,
}: {
  title: string;
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={
        "w-[34px] h-[34px] grid place-items-center rounded-sm cursor-pointer " +
        (on ? "bg-subtle text-accent" : "text-gray-600 hover:bg-gray-100")
      }
    >
      {children}
    </button>
  );
}

const Divider = () => (
  <span className="w-px self-stretch bg-gray-200" aria-hidden="true" />
);

export function DrawToolbarView({
  active,
  featureCount,
  selectedCount,
  busy,
  error,
  onSetMode,
  onDelete,
  onCommit,
}: {
  active: EditMode;
  featureCount: number;
  selectedCount: number;
  busy: boolean;
  error: string | null;
  onSetMode: (mode: EditMode) => void;
  onDelete: () => void;
  onCommit: () => void;
}) {
  const canDelete = selectedCount > 0;
  const canCommit = featureCount > 0 && !busy;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2] flex flex-col items-center gap-1.5">
      {/* Segmented digitising bar: [ Select ] | [ Point Line Polygon ] | [ Delete ] | [ Commit ] */}
      <div className="flex items-center gap-1.5 p-[5px] bg-white border border-gray-200 rounded-lg">
        <ToolButton
          title={MODES[0].title}
          on={active === "select"}
          onClick={() => onSetMode(active === "select" ? "static" : "select")}
        >
          <SelectIcon />
        </ToolButton>

        <Divider />

        <div className="flex items-center gap-1.5">
          {MODES.slice(1).map(({ mode, title, Icon }) => {
            const on = active === mode;
            return (
              <ToolButton
                key={mode}
                title={title}
                on={on}
                onClick={() => onSetMode(on ? "static" : mode)}
              >
                <Icon />
              </ToolButton>
            );
          })}
        </div>

        <Divider />

        <button
          type="button"
          title="Delete the selected feature"
          disabled={!canDelete}
          onClick={onDelete}
          className={
            "w-[34px] h-[34px] grid place-items-center rounded-sm " +
            (canDelete
              ? "text-gray-600 cursor-pointer hover:bg-gray-100 hover:text-danger"
              : "text-gray-300 cursor-not-allowed")
          }
        >
          <DeleteIcon />
        </button>

        <Divider />

        <button
          type="button"
          title="Write the drawn features into a DuckDB table"
          disabled={!canCommit}
          onClick={onCommit}
          className={
            "flex items-center gap-1.5 h-[34px] px-3 rounded-sm text-editor font-medium " +
            "text-white bg-success cursor-pointer hover:enabled:opacity-90 " +
            "disabled:cursor-default " +
            (busy ? "opacity-70" : featureCount === 0 ? "opacity-50" : "")
          }
        >
          {busy ? <Spinner /> : <CheckIcon />}
          <span>{busy ? "Committing…" : "Commit"}</span>
          {featureCount > 0 && !busy && (
            <span className="px-1.5 leading-none rounded-full text-xs bg-white/[.22]">
              {featureCount}
            </span>
          )}
        </button>
      </div>

      {/* Status line: MODE · N features · M selected */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="font-mono text-gray-600">{MODE_LABEL[active]}</span>
        <span aria-hidden="true">·</span>
        <span>
          {featureCount} feature{featureCount === 1 ? "" : "s"}
        </span>
        <span aria-hidden="true">·</span>
        <span>{selectedCount} selected</span>
      </div>

      {error && (
        <div
          className="flex items-center gap-1.5 max-w-sm px-2.5 py-1 text-xs text-danger bg-red-50 border border-red-200 rounded-sm"
          role="alert"
        >
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
