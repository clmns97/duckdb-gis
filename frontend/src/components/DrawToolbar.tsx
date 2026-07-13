import { useEffect, useState, useSyncExternalStore } from "react";
import { editing, type EditMode } from "../lib/editing";

// On-canvas digitizing toolbar (T-025), QGIS-style. Mounts over the map, drives
// the Terra Draw editing store: pick a draw mode, sketch features, switch to
// Select to edit vertices / delete features, then Commit the working set into a
// native DuckDB table. Reads the store via `useSyncExternalStore` (same pattern
// as SelectionChip / LayersPanel).

const MODES: Array<{ mode: EditMode; label: string; title: string }> = [
  { mode: "select", label: "Select", title: "Select & edit vertices (drag, add via midpoint, delete)" },
  { mode: "point", label: "Point", title: "Draw points" },
  { mode: "line", label: "Line", title: "Draw lines" },
  { mode: "polygon", label: "Polygon", title: "Draw polygons" },
];

export function DrawToolbar() {
  const version = useSyncExternalStore(editing.subscribe, () => editing.version);
  void version; // read so the component re-renders on store changes
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bring Terra Draw up once the map exists (idempotent). Runs on mount and if
  // the map arrives later (the store no-ops until getMap() is non-null).
  useEffect(() => {
    editing.init();
  }, [version]);

  const active = editing.mode;
  const count = editing.featureCount;

  const onCommit = async () => {
    setBusy(true);
    setError(null);
    try {
      await editing.commit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
              onClick={() => editing.setMode(on ? "static" : m.mode)}
            >
              {m.label}
            </button>
          );
        })}

        <span className="w-px self-stretch bg-gray-200 mx-0.5" aria-hidden="true" />

        <button
          className="text-editor px-2.5 py-1 rounded-md cursor-pointer text-gray-700 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-40 disabled:cursor-default"
          title="Delete the selected feature"
          disabled={active !== "select" || editing.selectedCount === 0}
          onClick={() => editing.deleteSelected()}
        >
          Delete
        </button>

        <button
          className="text-editor font-medium px-3 py-1 rounded-md cursor-pointer text-white bg-emerald-600 border border-emerald-700 hover:enabled:bg-emerald-700 disabled:opacity-40 disabled:cursor-default"
          title="Write the drawn features into a DuckDB table"
          disabled={count === 0 || busy}
          onClick={onCommit}
        >
          {busy ? "Committing…" : `Commit${count ? ` (${count})` : ""}`}
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
