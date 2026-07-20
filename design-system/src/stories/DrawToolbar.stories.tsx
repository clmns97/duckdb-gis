import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DrawToolbarView, type EditMode, type DrawMode } from "../index";

const meta: Meta<typeof DrawToolbarView> = {
  title: "Panels/DrawToolbar",
  component: DrawToolbarView,
};
export default meta;

type Story = StoryObj<typeof DrawToolbarView>;

// A relative, map-like container; the toolbar is anchored top-left in it (the
// real app positions it via MapPanel, so the view is position-free).
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[560px] h-[170px] bg-gray-100 rounded-lg overflow-hidden">
      <div className="absolute top-3 left-3">{children}</div>
    </div>
  );
}

// Collapsed-mode props are irrelevant while editing; defaults keep the expanded
// stories terse.
const collapsedDefaults = {
  canBeginEdit: false,
  activeLayerName: null,
  onBeginEdit: () => {},
};

// Interactive: the toolbar is scoped to one geometry family (polygon here), so
// only Select + Polygon show. Clicking a tool toggles `active`; Save shows the
// busy spinner. Delete enables only when there's a selection (Select mode).
function Interactive({ allowedMode = "polygon" as DrawMode }) {
  const [active, setActive] = useState<EditMode>("select");
  const [busy, setBusy] = useState(false);

  return (
    <Stage>
      <DrawToolbarView
        expanded
        {...collapsedDefaults}
        active={active}
        allowedMode={allowedMode}
        targetName="new_layer"
        isNew
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
        onCancel={() => {}}
      />
    </Stage>
  );
}

export const Default: Story = { render: () => <Interactive /> };

// Idle: the collapsed Edit button, bound to a ready catalog layer.
export const Collapsed: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        expanded={false}
        canBeginEdit
        activeLayerName="buildings"
        onBeginEdit={() => {}}
        active="static"
        allowedMode={null}
        targetName=""
        isNew={false}
        featureCount={0}
        selectedCount={0}
        busy={false}
        error={null}
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    </Stage>
  ),
};

// Idle with no editable active layer → the Edit button is disabled.
export const CollapsedDisabled: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        expanded={false}
        canBeginEdit={false}
        activeLayerName={null}
        onBeginEdit={() => {}}
        active="static"
        allowedMode={null}
        targetName=""
        isNew={false}
        featureCount={0}
        selectedCount={0}
        busy={false}
        error={null}
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    </Stage>
  ),
};

// Editing an existing polygon layer with a live selection → Delete enabled, dirty
// Save badge.
export const WithSelection: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        expanded
        {...collapsedDefaults}
        active="select"
        allowedMode="polygon"
        targetName="buildings"
        isNew={false}
        featureCount={5}
        selectedCount={2}
        busy={false}
        error={null}
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    </Stage>
  ),
};

// Saving → spinner + dimmed, disabled button, "Saving…" label.
export const Busy: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        expanded
        {...collapsedDefaults}
        active="polygon"
        allowedMode="polygon"
        targetName="parcels"
        isNew
        featureCount={4}
        selectedCount={0}
        busy
        error={null}
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    </Stage>
  ),
};

// Commit failure → inline error pill under the bar.
export const Error: Story = {
  render: () => (
    <Stage>
      <DrawToolbarView
        expanded
        {...collapsedDefaults}
        active="line"
        allowedMode="line"
        targetName="roads"
        isNew={false}
        featureCount={2}
        selectedCount={0}
        busy={false}
        error="Could not write features: table roads is read-only"
        onSetMode={() => {}}
        onDelete={() => {}}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    </Stage>
  ),
};
