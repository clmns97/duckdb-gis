import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppLogo } from "../index";

const meta: Meta<typeof AppLogo> = {
  title: "Primitives/AppLogo",
  component: AppLogo,
};
export default meta;

type Story = StoryObj<typeof AppLogo>;

// The duckdb-gis mark at favicon, header (26 px) and large sizes.
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <AppLogo size={16} />
      <AppLogo />
      <AppLogo size={64} />
    </div>
  ),
};
