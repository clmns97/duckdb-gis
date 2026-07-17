import type { Meta, StoryObj } from "@storybook/react-vite";
import { SymbologyGlyph, type GeometryKind, type LayerStyle } from "../index";

const meta: Meta<typeof SymbologyGlyph> = {
  title: "Primitives/SymbologyGlyph",
  component: SymbologyGlyph,
};
export default meta;

type Story = StoryObj<typeof SymbologyGlyph>;

// Indigo base style (the same seed the app's first layer uses).
const style: LayerStyle = {
  fillColor: [99, 102, 241],
  lineColor: [73, 74, 185],
  fillOpacity: 0.6,
  lineWidth: 1,
  pointRadius: 4,
};

const KINDS: GeometryKind[] = ["point", "line", "polygon"];

// The per-geometry symbology swatch shown before a layer name, plus the neutral
// loading placeholder (rendered when kind/style haven't resolved yet).
export const Geometries: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {KINDS.map((kind) => (
        <div key={kind} className="flex items-center gap-2 text-editor text-gray-900">
          <SymbologyGlyph kind={kind} style={style} />
          <span>{kind}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 text-editor text-gray-500">
        <SymbologyGlyph />
        <span>loading…</span>
      </div>
    </div>
  ),
};
