// Presentational chip: a floating readout of `count` selected features with a
// clear affordance (T-025 / T-040). QGIS-style selection pill — a rounded indigo
// tint with a cursor glyph and an × clear button. Prop-driven and store-free, so
// it renders in isolation (Storybook / design-sync / the UI kit) with no
// selection store. The store-connected `SelectionChip` wraps this.

function CursorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M4 4l7 16 2.5-6.5L20 11z" />
    </svg>
  );
}

export function SelectionChipView({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div
      className="absolute top-3 left-3 z-[2] flex items-center gap-1.5 pl-2.5 pr-1 py-1 text-editor bg-subtle border border-primary-border-active text-accent rounded-full"
      role="status"
    >
      <CursorIcon />
      <span>{count} selected</span>
      <button
        type="button"
        className="grid place-items-center w-5 h-5 shrink-0 rounded-full cursor-pointer hover:bg-accent/[.14]"
        onClick={onClear}
        title="Clear selection"
        aria-label="Clear selection"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
