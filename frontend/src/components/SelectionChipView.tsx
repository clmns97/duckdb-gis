// Presentational chip: a floating readout of `count` selected features with a
// clear affordance. Prop-driven and store-free, so it renders in isolation
// (Storybook / design-sync / the UI kit) with no selection store. The
// store-connected `SelectionChip` wraps this.
export function SelectionChipView({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
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
        onClick={onClear}
        title="Clear selection"
      >
        Clear
      </button>
    </div>
  );
}
