import { useEffect, useState, useSyncExternalStore } from "react";
import { editing, canEditInPlace } from "../lib/editing";
import { layers } from "../lib/layers";
import { errMsg } from "../lib/duckdb";
import { DrawToolbarView } from "./DrawToolbarView";

// Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z (or Ctrl+Y) drive undo/redo (T-068) while
// editing — a global listener gated on `editing.isEditing()` so it's a no-op
// otherwise, and on the focused element not being a text field/contenteditable
// so it never steals native undo from the SQL editor or a modal's inputs.
function isTextEditable(el: EventTarget | null): boolean {
  const target = el as HTMLElement | null;
  return Boolean(
    target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable),
  );
}

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editing.isEditing() || isTextEditable(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        editing.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        editing.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  // Cancel releases the source's write lock (#66) same as Commit does, so it
  // can fail too — surface that rather than silently leaving the source
  // writable.
  const onCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await editing.finishEdit();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Advanced editing ops (T-045/046/048): run the store action, surfacing any
  // error (merge SQL, paste family mismatch) into the toolbar's error slot.
  const guard = (fn: () => void | Promise<void>) => () => {
    setError(null);
    Promise.resolve()
      .then(fn)
      .catch((e) => setError(errMsg(e)));
  };

  // Collapsed: the active layer is the Edit button's target. Only catalog-table
  // layers that have finished loading can be edited in place (query-backed and
  // still-loading layers can't); `beginEdit` also enforces the row-count cap and
  // surfaces its own errors into the same `error` slot.
  const active = layers.active();
  const canBeginEdit = canEditInPlace(active);
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
      snapEnabled={editing.snapEnabled}
      canPaste={editing.canPaste}
      canUndo={editing.canUndo}
      canRedo={editing.canRedo}
      busy={busy}
      error={error}
      onSetMode={(mode) => editing.setMode(mode)}
      onUndo={() => editing.undo()}
      onRedo={() => editing.redo()}
      onDelete={() => editing.deleteSelected()}
      onRotate={guard(() => editing.rotateSelected())}
      onScale={guard(() => editing.scaleSelected())}
      onMerge={guard(() => editing.mergeSelected())}
      onDuplicate={guard(() => editing.duplicateSelected())}
      onCopy={guard(() => editing.copySelected())}
      onPaste={guard(() => editing.paste())}
      onToggleSnap={() => editing.toggleSnapping()}
      onCommit={onCommit}
      onCancel={() => void onCancel()}
    />
  );
}
