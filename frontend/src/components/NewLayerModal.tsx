import { useState } from "react";
import { Modal, Button, FieldLabel, ModalNote, INPUT } from "./Modal";
import type { GeometryKind } from "../lib/layers";

// Create a new, empty single-geometry layer and drop into edit mode on it
// (T-038). A name (becomes a `main.<name>` table on the first Save) and one
// geometry family — a layer never mixes geometry types. Purely a form; the
// caller (`App`) owns entering edit mode via `editing.beginNewLayer`.

const KINDS: Array<{ kind: GeometryKind; label: string }> = [
  { kind: "point", label: "Point" },
  { kind: "line", label: "Line" },
  { kind: "polygon", label: "Polygon" },
];

export function NewLayerModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, geometryKind: GeometryKind) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GeometryKind>("polygon");
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0;

  const submit = () => {
    if (canCreate) onCreate(trimmed, kind);
  };

  return (
    <Modal
      title="New layer"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canCreate} onClick={submit}>
            Create &amp; edit
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-2">
        <FieldLabel>Name</FieldLabel>
        <input
          className={INPUT}
          type="text"
          value={name}
          placeholder="new_layer"
          spellCheck={false}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </label>

      <div className="flex flex-col gap-2">
        <FieldLabel>Geometry type</FieldLabel>
        <div className="flex gap-2">
          {KINDS.map(({ kind: k, label }) => {
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  "flex-1 flex items-center justify-center h-9 rounded-sm border text-editor cursor-pointer " +
                  (on
                    ? "border-primary bg-subtle text-accent"
                    : "border-gray-200 text-gray-600 hover:bg-gray-100")
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ModalNote>
        Creates an empty table in <code className="font-mono text-[0.95em]">main</code> and opens
        it for drawing. The table is written on the first Save.
      </ModalNote>
    </Modal>
  );
}
