import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContextMenu } from "../index";

const meta: Meta<typeof ContextMenu> = {
  title: "Primitives/ContextMenu",
  component: ContextMenu,
  // Anchored at viewport coordinates over a full-screen backdrop.
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof ContextMenu>;

// Section headers, a disabled item, a checked item, and a hover flyout submenu.
export const Default: Story = {
  render: () => (
    <ContextMenu
      x={48}
      y={48}
      onClose={() => {}}
      items={[
        { label: "Layer", header: true },
        { label: "Zoom to layer", onSelect: () => {} },
        { label: "Rename…", onSelect: () => {} },
        { label: "Remove", onSelect: () => {}, disabled: true },
        { label: "Basemap", header: true },
        {
          label: "Choose basemap",
          children: [
            { label: "OpenStreetMap", checked: true, onSelect: () => {} },
            { label: "Carto Light", onSelect: () => {} },
            { label: "ESRI Satellite", onSelect: () => {} },
          ],
        },
      ]}
    />
  ),
};
