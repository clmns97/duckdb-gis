import { useState, useSyncExternalStore } from "react";
import { editing } from "../lib/editing";
import { layers } from "../lib/layers";
import { errMsg } from "../lib/duckdb";
import { DrawToolbarView } from "./DrawToolbarView";

// Store-connected on-canvas digitizing control (T-025 / T-038). A top-left map
// control (like the zoom/selection chrome): when idle it's a compact **Edit**
// button bound to the active layer; clicking it enters edit-in-place and it
// expands into the full digitising bar. Reads the `editing` and `layers` stores
// via `useSyncExternalStore` (same pattern as SelectionChip). Terra Draw is
// brought up by the `begin*` entry points, not here.
export function DrawToolbar() {
  const editingVersion = useSyncExternalStore(editing.subscribe, () => editing.version);
  const layersVersion = useSyncExternalStore(layers.subscribe, () => layers.version);
  void editingVersion; // read so the component re-renders on store changes
  void layersVersion;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editing.isEditing();

  const onCommit = async () => {
    setBusy(true);
    setError(null);
    try {
      await editing.commit();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Collapsed: the active layer is the Edit button's target. Only catalog-table
  // layers that have finished loading can be edited in place (query-backed and
  // still-loading layers can't); `beginEdit` also enforces the row-count cap and
  // surfaces its own errors into the same `error` slot.
  const active = layers.active();
  const canBeginEdit = Boolean(active?.source && active.status === "ready");
  const onBeginEdit = () => {
    if (!active) return;
    setError(null);
    editing.beginEdit(active).catch((e) => setError(errMsg(e)));
  };

  return (
    <DrawToolbarView
      expanded={isEditing}
      canBeginEdit={canBeginEdit}
      activeLayerName={active?.name ?? null}
      onBeginEdit={onBeginEdit}
      active={editing.mode}
      allowedMode={editing.allowedDrawMode}
      targetName={editing.target?.name ?? ""}
      isNew={editing.target?.kind === "new"}
      featureCount={editing.featureCount}
      selectedCount={editing.selectedCount}
      busy={busy}
      error={error}
      onSetMode={(mode) => editing.setMode(mode)}
      onDelete={() => editing.deleteSelected()}
      onCommit={onCommit}
      onCancel={() => editing.finishEdit()}
    />
  );
}
