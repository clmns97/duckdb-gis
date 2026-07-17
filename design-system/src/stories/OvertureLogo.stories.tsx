import type { Meta, StoryObj } from "@storybook/react-vite";
import { OvertureLogo } from "../index";

const meta: Meta<typeof OvertureLogo> = {
  title: "Primitives/OvertureLogo",
  component: OvertureLogo,
};
export default meta;

type Story = StoryObj<typeof OvertureLogo>;

// The fixed multi-color Overture brand mark at a few sizes.
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <OvertureLogo size={16} />
      <OvertureLogo size={32} />
      <OvertureLogo size={64} />
    </div>
  ),
};
