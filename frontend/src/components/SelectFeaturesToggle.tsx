import { useSyncExternalStore } from "react";
import { boxSelect } from "../lib/overtureTiles";
import { pmSelection } from "../lib/pmtilesSelection";

// On-canvas "Select features" toggle for Overture PMTiles layers (T-058). Same
// chrome as the Edit button / MapLibre controls (white, rounded-lg, shadow-md,
// 34×34). When on, a drag paints a rectangle and selects the features under it
// (click-select works either way). A badge shows the current selection count so
// the user knows there's something to "Create Layer from Selection" from.
function MarqueeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="m12 12 5 2-2 1-1 2-2-5Z" fill="currentColor" />
    </svg>
  );
}

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
        <MarqueeIcon />
      </button>
      {count > 0 && (
        <span className="pr-2.5 pl-1.5 text-xs text-gray-600 whitespace-nowrap">
          {count} selected
        </span>
      )}
    </div>
  );
}
