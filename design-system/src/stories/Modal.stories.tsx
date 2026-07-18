import type { Meta, StoryObj } from "@storybook/react-vite";
import { Modal, FieldLabel, ModalNote, Button } from "../index";

const meta: Meta<typeof Modal> = {
  title: "Primitives/Modal",
  component: Modal,
  // The modal renders a fixed full-viewport backdrop, so give it the whole canvas.
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: () => (
    <Modal
      title="Attach database"
      onClose={() => {}}
      footer={
        <>
          <Button variant="ghost" onClick={() => {}}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => {}}>
            Attach
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <FieldLabel>Path</FieldLabel>
        <input
          className="border border-hairline rounded-sm px-2 py-1 text-editor text-gray-900"
          defaultValue="/data/city.duckdb"
        />
      </label>
      <ModalNote>Attaches the file as a read-only catalog you can query.</ModalNote>
      <ModalNote error>Could not open the file: not a DuckDB database.</ModalNote>
    </Modal>
  ),
};
