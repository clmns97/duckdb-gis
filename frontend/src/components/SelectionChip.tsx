import { useSyncExternalStore } from "react";
import { selection } from "../lib/selection";
import { SelectionChipView } from "./SelectionChipView";

// Store-connected wrapper the app renders. Subscribes to the selection store;
// `version` is the external snapshot. Hidden while nothing is selected, else
// renders the presentational `SelectionChipView`.
export function SelectionChip() {
  const version = useSyncExternalStore(selection.subscribe, () => selection.version);
  // `version` is read so the component re-renders on selection changes.
  void version;
  const count = selection.size;
  if (count === 0) return null;

  return <SelectionChipView count={count} onClear={() => selection.clear()} />;
}
