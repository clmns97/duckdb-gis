import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectionChipView } from "../index";

const meta: Meta<typeof SelectionChipView> = {
  title: "Panels/SelectionChip",
  component: SelectionChipView,
};
export default meta;

type Story = StoryObj<typeof SelectionChipView>;

// The chip is absolutely positioned (top-left over the map), so stage it inside
// a relative, map-like container.
function Stage({ count }: { count: number }) {
  return (
    <div className="relative w-[340px] h-[90px] bg-gray-100 rounded-lg overflow-hidden">
      <SelectionChipView count={count} onClear={() => {}} />
    </div>
  );
}

export const One: Story = { render: () => <Stage count={1} /> };
export const Many: Story = { render: () => <Stage count={5} /> };
