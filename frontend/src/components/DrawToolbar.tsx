import { useEffect, useState, useSyncExternalStore } from "react";
import { editing } from "../lib/editing";
import { DrawToolbarView } from "./DrawToolbarView";

// Store-connected on-canvas digitizing toolbar (T-025). Mounts over the map,
// drives the Terra Draw editing store, and renders the presentational
// `DrawToolbarView`. Reads the store via `useSyncExternalStore` (same pattern as
// SelectionChip / LayersPanel).
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
    <DrawToolbarView
      active={editing.mode}
      featureCount={editing.featureCount}
      selectedCount={editing.selectedCount}
      busy={busy}
      error={error}
      onSetMode={(mode) => editing.setMode(mode)}
      onDelete={() => editing.deleteSelected()}
      onCommit={onCommit}
    />
  );
}
