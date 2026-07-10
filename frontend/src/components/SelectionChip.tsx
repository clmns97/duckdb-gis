import { useSyncExternalStore } from "react";
import { selection } from "../lib/selection";

// Floating readout of the current map selection with a clear affordance.
// Subscribes to the selection store; `version` is the external snapshot.
export function SelectionChip() {
  const version = useSyncExternalStore(selection.subscribe, () => selection.version);
  // `version` is read so the component re-renders on selection changes.
  void version;
  const count = selection.size;
  if (count === 0) return null;

  return (
    <div className="selection-chip" role="status">
      <span className="sel-dot" aria-hidden="true" />
      <span>
        {count} feature{count === 1 ? "" : "s"} selected
      </span>
      <button className="sel-clear" onClick={() => selection.clear()} title="Clear selection">
        Clear
      </button>
    </div>
  );
}
