import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { Button } from "../index";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

const VARIANTS = ["primary", "ghost", "mini", "icon"] as const;

// The whole button family (matching the DuckDB-UI set), enabled and disabled.
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((v) => (
        <div key={v} className="flex items-center gap-3">
          <span className="w-14 text-sm text-gray-500">{v}</span>
          <Button variant={v}>
            {v === "icon" ? <Plus size={16} /> : v === "mini" ? "+ Add" : "Button"}
          </Button>
          <Button variant={v} disabled>
            {v === "icon" ? <Plus size={16} /> : v === "mini" ? "+ Add" : "Disabled"}
          </Button>
        </div>
      ))}
    </div>
  ),
};
