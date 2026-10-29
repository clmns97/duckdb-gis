import { useState } from "react";
import { FormModal, TextField, FieldLabel } from "./Modal";
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
  return (
    <FormModal
      title="New layer"
      action="Create & edit"
      canSubmit={name.trim().length > 0}
      onSubmit={() => onCreate(name.trim(), kind)}
      onClose={onClose}
      note={
        <>
          Creates an empty table in <code className="font-mono text-[0.95em]">main</code> and opens
          it for drawing. The table is written on the first Save.
        </>
      }
    >
      <TextField
        label="Name"
        value={name}
        placeholder="new_layer"
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <FieldLabel>Geometry type</FieldLabel>
        <div className="flex gap-2">
          {KINDS.map(({ kind: k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                "flex-1 flex items-center justify-center h-9 rounded-sm border text-editor cursor-pointer " +
                (k === kind
                  ? "border-primary bg-subtle text-accent"
                  : "border-gray-200 text-gray-600 hover:bg-gray-100")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </FormModal>
  );
}
