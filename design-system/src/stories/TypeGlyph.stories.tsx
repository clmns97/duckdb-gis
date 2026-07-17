import type { Meta, StoryObj } from "@storybook/react-vite";
import { TypeGlyph, type TypeKind } from "../index";

const meta: Meta<typeof TypeGlyph> = {
  title: "Primitives/TypeGlyph",
  component: TypeGlyph,
};
export default meta;

type Story = StoryObj<typeof TypeGlyph>;

const KINDS: TypeKind[] = [
  "int",
  "float",
  "text",
  "bool",
  "temporal",
  "geometry",
  "other",
];

// The column data-type glyph across every TypeKind, as shown before column names.
export const AllKinds: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {KINDS.map((k) => (
        <div key={k} className="flex items-center gap-2 text-editor text-gray-900">
          <TypeGlyph kind={k} />
          <span>{k}</span>
        </div>
      ))}
    </div>
  ),
};
