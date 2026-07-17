import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DrawToolbarView, type EditMode } from "../index";

const meta: Meta<typeof DrawToolbarView> = {
  title: "Panels/DrawToolbar",
  component: DrawToolbarView,
};
export default meta;

type Story = StoryObj<typeof DrawToolbarView>;

// Interactive: clicking a mode toggles `active`; Commit shows the busy state.
// Delete enables only in Select mode with a selection (simulated here).
function Interactive() {
  const [active, setActive] = useState<EditMode>("static");
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative w-[560px] h-[130px] bg-gray-100 rounded-lg overflow-hidden">
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
          setTimeout(() => setBusy(false), 800);
        }}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Interactive /> };
