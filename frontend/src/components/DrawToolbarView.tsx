import type { ReactElement, ReactNode } from "react";
import type { EditMode, DrawMode } from "../lib/editing";

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

// Pencil — the collapsed Edit affordance (T-038).
function EditIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17l-1 3z" />
      <path d="M13.5 7.5l3 3" />
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

// Placeholder glyphs for the advanced editing tools (T-045/046/048/049). Final
// icons come from Claude Design; these follow the stroked custom-SVG pattern.
function RotateIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3v4h-4" />
    </svg>
  );
}

function ScaleIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 15v5h5M20 9V4h-5" />
      <path d="M4 20l6-6M20 4l-6 6" />
    </svg>
  );
}

function MergeIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </svg>
  );
}

function DuplicateIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="4" y="4" width="12" height="12" rx="1.5" />
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function CopyIcon2({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function PasteIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function SnapIcon({ size = ICON }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M6 4v7a6 6 0 0 0 12 0V4" />
      <path d="M6 4h4M14 4h4M6 8.5h4M14 8.5h4" />
    </svg>
  );
}

// --- Layout helpers ---------------------------------------------------------

// The single draw mode a target allows (its geometry family), with its glyph +
// tooltip. Only this button appears alongside Select — one geometry per layer.
const DRAW: Record<DrawMode, { title: string; Icon: (p: IconProps) => ReactElement }> = {
  point: { title: "Draw points (P)", Icon: PointIcon },
  line: { title: "Draw lines (L)", Icon: LineIcon },
  polygon: { title: "Draw polygons (G)", Icon: PolygonIcon },
};

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

// A 34×34 action icon button (not a toggle): greys out when disabled, and turns
// its glyph red on hover when `danger` (Delete).
function ActionButton({
  title,
  disabled,
  danger,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={
        "w-[34px] h-[34px] grid place-items-center rounded-sm " +
        (disabled
          ? "text-gray-300 cursor-not-allowed"
          : "text-gray-600 cursor-pointer hover:bg-gray-100 " +
            (danger ? "hover:text-danger" : "hover:text-gray-900"))
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
  expanded,
  canBeginEdit,
  activeLayerName,
  onBeginEdit,
  active,
  allowedMode,
  targetName,
  isNew,
  featureCount,
  selectedCount,
  snapEnabled,
  canPaste,
  busy,
  error,
  onSetMode,
  onDelete,
  onRotate,
  onScale,
  onMerge,
  onDuplicate,
  onCopy,
  onPaste,
  onToggleSnap,
  onCommit,
  onCancel,
}: {
  /** True while an edit target is active — render the full digitising bar; false
   *  renders the collapsed Edit button (T-038). */
  expanded: boolean;
  /** Whether the active layer can be edited in place (a ready catalog layer). */
  canBeginEdit: boolean;
  /** Name of the active layer, shown on the collapsed Edit button. */
  activeLayerName: string | null;
  /** Enter edit-in-place on the active layer. */
  onBeginEdit: () => void;
  active: EditMode;
  /** The one draw mode this layer's geometry family allows (T-038). Null only in
   *  isolation (Storybook) where no target is bound; then no draw button shows. */
  allowedMode: DrawMode | null;
  /** Name of the layer being edited, shown so it's clear what's in scope. */
  targetName: string;
  /** True when editing a not-yet-created new layer (vs. an existing one). */
  isNew: boolean;
  featureCount: number;
  selectedCount: number;
  /** Whether snapping is on (T-049). */
  snapEnabled: boolean;
  /** Whether the clipboard holds paste-compatible features (T-048). */
  canPaste: boolean;
  busy: boolean;
  error: string | null;
  onSetMode: (mode: EditMode) => void;
  onDelete: () => void;
  onRotate: () => void;
  onScale: () => void;
  onMerge: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleSnap: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const hasSelection = selectedCount > 0;
  const canMerge = selectedCount >= 2;
  const canCommit = featureCount > 0 && !busy;
  const drawGlyph = allowedMode ? DRAW[allowedMode] : null;

  // One control: an icon-only pencil button (a top-left map control) that is the
  // anchor the digitising bar slides out of. Idle → just the pencil, enters
  // edit-in-place on the active layer. Editing → the pencil goes active and the
  // tool group slides out to its right; clicking the pencil again stops editing.
  const pencilTitle = expanded
    ? `Stop editing${targetName ? ` · ${targetName}` : ""} (discard uncommitted changes)`
    : canBeginEdit
      ? `Edit ${activeLayerName}`
      : "Select a layer to edit";
  const pencilDisabled = !expanded && !canBeginEdit;

  return (
    <div className="flex flex-col items-start gap-1.5">
      {/* Same chrome as the native MapLibre controls (`.maplibregl-ctrl-group`):
          white, rounded-lg, shadow-md, no border — so the Edit button reads as
          one of the map controls. */}
      <div className="flex items-center bg-white rounded-lg shadow-md overflow-hidden">
        {/* Pencil = the anchor. Square, unrounded (the container owns the radius),
            so idle it reads as a single rounded icon button. */}
        <button
          type="button"
          title={pencilTitle}
          aria-pressed={expanded}
          disabled={pencilDisabled || busy}
          onClick={expanded ? onCancel : onBeginEdit}
          className={
            "w-[34px] h-[34px] grid place-items-center shrink-0 " +
            (expanded
              ? "bg-subtle text-accent cursor-pointer disabled:cursor-default"
              : canBeginEdit
                ? "text-gray-600 cursor-pointer hover:bg-gray-100 hover:text-gray-900"
                : "text-gray-300 cursor-not-allowed")
          }
        >
          <EditIcon />
        </button>

        {/* The digitising bar, sliding out of the pencil: [ Select ] | [ <family> ]
            | [ Delete ] | [ Save ]. Kept mounted so it animates both ways. */}
        <div
          className={
            "flex items-center overflow-hidden transition-[max-width,opacity] duration-200 ease-out " +
            (expanded ? "max-w-[900px] opacity-100" : "max-w-0 opacity-0 pointer-events-none")
          }
          aria-hidden={!expanded}
        >
          <Divider />
          {/* No vertical padding: every element is a 34px row so the collapsed
              container is a true 34×34 square. `pl-1.5` gives the tools a little
              breathing room after the divider; Save stays flush to the right so
              the container's rounded corner caps it. */}
          <div className="flex items-center gap-1.5 pl-1.5">
            <ToolButton
              title="Select & edit vertices (V)"
              on={active === "select"}
              onClick={() => onSetMode("select")}
            >
              <SelectIcon />
            </ToolButton>

            {drawGlyph && allowedMode && (
              <>
                <Divider />
                <ToolButton
                  title={drawGlyph.title}
                  on={active === allowedMode}
                  onClick={() => onSetMode(active === allowedMode ? "select" : allowedMode)}
                >
                  <drawGlyph.Icon />
                </ToolButton>
              </>
            )}

            <Divider />

            {/* Snapping toggle (T-049): latch drawing/vertex edits onto existing
                coordinates + edges. */}
            <ToolButton
              title={snapEnabled ? "Snapping on (click to disable)" : "Snapping off (click to enable)"}
              on={snapEnabled}
              onClick={onToggleSnap}
            >
              <SnapIcon />
            </ToolButton>

            <Divider />

            <ActionButton title="Delete the selected feature(s)" disabled={!hasSelection} danger onClick={onDelete}>
              <DeleteIcon />
            </ActionButton>

            <Divider />

            {/* Transforms on the current selection (T-045/T-046). Rotate/Scale
                are click-increments (15° / 1.1×); hold R / S and drag for
                continuous transform. Merge unions ≥2 features into one. */}
            <ActionButton title="Rotate selection 15° (or hold R and drag)" disabled={!hasSelection} onClick={onRotate}>
              <RotateIcon />
            </ActionButton>
            <ActionButton title="Scale selection up (or hold S and drag)" disabled={!hasSelection} onClick={onScale}>
              <ScaleIcon />
            </ActionButton>
            <ActionButton title="Merge selected features into one" disabled={!canMerge} onClick={onMerge}>
              <MergeIcon />
            </ActionButton>

            <Divider />

            {/* Clipboard ops (T-048). */}
            <ActionButton title="Duplicate the selection" disabled={!hasSelection} onClick={onDuplicate}>
              <DuplicateIcon />
            </ActionButton>
            <ActionButton title="Copy the selection" disabled={!hasSelection} onClick={onCopy}>
              <CopyIcon2 />
            </ActionButton>
            <ActionButton title="Paste features" disabled={!canPaste} onClick={onPaste}>
              <PasteIcon />
            </ActionButton>

            <Divider />

            <button
              type="button"
              title={isNew ? "Create the layer table and save the drawn features" : "Save edits back to the layer's table"}
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
              <span>{busy ? "Saving…" : "Save"}</span>
              {featureCount > 0 && !busy && (
                <span className="px-1.5 leading-none rounded-full text-xs bg-white/[.22]">
                  {featureCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status line: MODE · N features · M selected (only while editing). */}
      {expanded && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="font-mono text-gray-600">{MODE_LABEL[active]}</span>
          <span aria-hidden="true">·</span>
          <span>
            {featureCount} feature{featureCount === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span>{selectedCount} selected</span>
        </div>
      )}

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
