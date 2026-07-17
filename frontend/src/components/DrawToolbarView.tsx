import type { EditMode } from "../lib/editing";

// Presentational digitizing toolbar (T-025), QGIS-style: pick a draw mode, then
// Delete / Commit the working set. Prop-driven and store-free, so it renders in
// isolation (Storybook / design-sync / the UI kit) with no Terra Draw or map.
// The store-connected `DrawToolbar` wraps this and wires it to the `editing`
// store. `EditMode` is a type-only import, so the runtime editing graph
// (terra-draw, deck, the map) is never pulled in here.

const MODES: Array<{ mode: EditMode; label: string; title: string }> = [
  { mode: "select", label: "Select", title: "Select & edit vertices (drag, add via midpoint, delete)" },
  { mode: "point", label: "Point", title: "Draw points" },
  { mode: "line", label: "Line", title: "Draw lines" },
  { mode: "polygon", label: "Polygon", title: "Draw polygons" },
];

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
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2] flex flex-col items-center gap-1">
      <div className="flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-lg shadow-md">
        {MODES.map((m) => {
          const on = active === m.mode;
          return (
            <button
              key={m.mode}
              className={
                "text-editor px-2.5 py-1 rounded-md cursor-pointer " +
                (on
                  ? "bg-primary text-white"
                  : "text-gray-700 hover:bg-gray-200 hover:text-gray-900")
              }
              title={m.title}
              onClick={() => onSetMode(on ? "static" : m.mode)}
            >
              {m.label}
            </button>
          );
        })}

        <span className="w-px self-stretch bg-gray-200 mx-0.5" aria-hidden="true" />

        <button
          className="text-editor px-2.5 py-1 rounded-md cursor-pointer text-gray-700 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-40 disabled:cursor-default"
          title="Delete the selected feature"
          disabled={active !== "select" || selectedCount === 0}
          onClick={onDelete}
        >
          Delete
        </button>

        <button
          className="text-editor font-medium px-3 py-1 rounded-md cursor-pointer text-white bg-emerald-600 border border-emerald-700 hover:enabled:bg-emerald-700 disabled:opacity-40 disabled:cursor-default"
          title="Write the drawn features into a DuckDB table"
          disabled={featureCount === 0 || busy}
          onClick={onCommit}
        >
          {busy ? "Committing…" : `Commit${featureCount ? ` (${featureCount})` : ""}`}
        </button>
      </div>

      {error && (
        <div
          className="max-w-sm px-2.5 py-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md shadow-sm"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
