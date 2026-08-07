import { useSyncExternalStore } from "react";
import { SquareDashedMousePointer } from "lucide-react";
import { boxSelect } from "../lib/overtureTiles";
import { pmSelection } from "../lib/pmtilesSelection";

// On-canvas "Select features" toggle for Overture PMTiles layers (T-058). Same
// chrome as the Edit button / MapLibre controls (white, rounded-lg, shadow-md,
// 34×34). When on, a drag paints a rectangle and selects the features under it
// (click-select works either way). A badge shows the current selection count so
// the user knows there's something to "Create Layer from Selection" from.
export function SelectFeaturesToggle() {
  const active = useSyncExternalStore(boxSelect.subscribe, () => boxSelect.active);
  useSyncExternalStore(pmSelection.subscribe, () => pmSelection.version);
  const count = pmSelection.size;

  return (
    <div className="flex items-center bg-white rounded-lg shadow-md overflow-hidden">
      <button
        type="button"
        title="Select features (drag a box; Shift to add)"
        aria-pressed={active}
        onClick={() => boxSelect.toggle()}
        className={
          "w-[34px] h-[34px] grid place-items-center shrink-0 cursor-pointer " +
          (active
            ? "bg-subtle text-accent"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")
        }
      >
        <SquareDashedMousePointer size={18} strokeWidth={2} className="shrink-0" />
      </button>
      {count > 0 && (
        <span className="pr-2.5 pl-1.5 text-xs text-gray-600 whitespace-nowrap">
          {count} selected
        </span>
      )}
    </div>
  );
}
