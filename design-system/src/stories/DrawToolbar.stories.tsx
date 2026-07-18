import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DrawToolbarView, type EditMode } from "../index";

const meta: Meta<typeof DrawToolbarView> = {
  title: "Panels/DrawToolbar",
  component: DrawToolbarView,
};
export default meta;

type Story = StoryObj<typeof DrawToolbarView>;

// A relative, map-like container the absolutely-positioned toolbar sits in.
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[560px] h-[150px] bg-gray-100 rounded-lg overflow-hidden">
      {children}
    </div>
  );
}

// Interactive: clicking a tool toggles `active`; Commit shows the busy spinner.
// Delete enables only when there's a selection (simulated in Select mode).
function Interactive() {
  const [active, setActive] = useState<EditMode>("static");
  const [busy, setBusy] = useState(false);

  return (
    <Stage>
      <DrawToolbarView
        active={active}
        featureCount={3}
        selectedCount={active === "select" ? 1 : 0}
        busy={busy}
        error={null}
        onSetMode={setActive}
        onDelete={() => {}}
        onCommit={() => {
          setBusy(true);
          setTimeout(() => setBusy(false), 900);
        }}
      />
    </Stage>
  );
}

export const Default: Story = { render: () => <Interactive /> };

// Select mode with a live selection → Delete enabled, dirty Commit badge.
export const WithSelection: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        active="select"
        featureCount={5}
        selectedCount={2}
        busy={false}
        error={null}
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
      />
    </Stage>
  ),
};

// Committing → spinner + dimmed, disabled button, "Committing…" label.
export const Busy: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        active="polygon"
        featureCount={4}
        selectedCount={0}
        busy
        error={null}
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
      />
    </Stage>
  ),
};

// Commit failure → inline error pill under the bar.
export const Error: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        active="line"
        featureCount={2}
        selectedCount={0}
        busy={false}
        error="Could not write features: table draw_features is read-only"
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
      />
    </Stage>
  ),
};
