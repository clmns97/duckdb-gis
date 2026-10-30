import { useSyncExternalStore } from "react";
import { selection } from "../lib/selection";
import { layers } from "../lib/layers";
import { SelectionChipView } from "./SelectionChipView";

// Store-connected wrapper the app renders: the active layer's selection (#110).
// Hidden while nothing is selected there, else renders `SelectionChipView`.
export function SelectionChip() {
  useSyncExternalStore(selection.subscribe, () => selection.version);
  useSyncExternalStore(layers.subscribe, () => layers.version);
  const layer = layers.active();
  const count = selection.size(layer?.id);
  if (!layer || count === 0) return null;

  return <SelectionChipView count={count} layer={layer.name} onClear={() => selection.clear(layer.id)} />;
}
