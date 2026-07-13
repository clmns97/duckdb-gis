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
    <div
      className="absolute top-3 left-3 z-[2] flex items-center gap-2 pl-2.5 pr-2 py-[5px] text-editor text-gray-900 bg-white border border-gray-200 rounded-lg shadow-md"
      role="status"
    >
      <span
        className="w-2.5 h-2.5 shrink-0 rounded-sm bg-[#ff9f1c] border border-[#d97706]"
        aria-hidden="true"
      />
      <span>
        {count} feature{count === 1 ? "" : "s"} selected
      </span>
      <button
        className="text-xs text-gray-500 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-gray-200 hover:text-gray-900"
        onClick={() => selection.clear()}
        title="Clear selection"
      >
        Clear
      </button>
    </div>
  );
}
