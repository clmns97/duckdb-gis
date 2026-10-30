import { useSyncExternalStore } from "react";
import { SquareDashedMousePointer } from "lucide-react";
import { selectTool } from "../lib/selectTool";

// On-canvas "Select features" toggle (#110), for every layer kind. Same chrome
// as the Edit button / MapLibre controls (white, rounded-lg, shadow-md, 34×34).
// When on, a tap toggles a feature of the active layer and a drag draws a box
// whose features are added. The count lives in the SelectionChip below it.
export function SelectFeaturesToggle() {
  const active = useSyncExternalStore(selectTool.subscribe, () => selectTool.active);

  return (
    <div className="flex items-center bg-white rounded-lg shadow-md overflow-hidden">
      <button
        type="button"
        title="Select features of the active layer (tap to add or remove; drag a box)"
        aria-label="Select features"
        aria-pressed={active}
        onClick={() => selectTool.toggle()}
        className={
          "w-[34px] h-[34px] grid place-items-center shrink-0 cursor-pointer " +
          (active
            ? "bg-subtle text-accent"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
        }
      >
        <SquareDashedMousePointer size={18} strokeWidth={2} className="shrink-0" />
      </button>
    </div>
  );
}
