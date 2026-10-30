import { useState, useSyncExternalStore } from "react";
import { FormModal, FieldLabel, SelectField, TextField, INPUT } from "./Modal";
import { LayerInput } from "./ProcessingModal";
import { layers } from "../lib/layers";
import { selection, type SelectMode } from "../lib/selection";
import { defaultInput, inputLayers, type ToolInput } from "../lib/geoprocessing";
import { selectByExpression, selectByLocation, type LocationPredicate } from "../lib/selectBy";

// Select by expression / Select by location (#113). Fills the chosen layer's
// selection (QGIS's four modes) and makes that layer active, so the selection
// chip and the next tool pick it up.

const MODES: Array<{ value: SelectMode; label: string }> = [
  { value: "replace", label: "Create new selection" },
  { value: "add", label: "Add to current selection" },
  { value: "remove", label: "Remove from current selection" },
  { value: "intersect", label: "Select within current selection" },
];

const PREDICATES: Array<{ value: LocationPredicate; label: string }> = [
  { value: "intersects", label: "intersect" },
  { value: "within", label: "are within" },
  { value: "contains", label: "contain" },
  { value: "disjoint", label: "don't touch" },
  { value: "dwithin", label: "are within a distance of" },
];

export function SelectByModal({ kind, onClose }: { kind: "expression" | "location"; onClose: () => void }) {
  useSyncExternalStore(selection.subscribe, () => selection.version);
  const [layerId, setLayerId] = useState(() => defaultInput().layerId);
  const [mode, setMode] = useState<SelectMode>("replace");
  const [where, setWhere] = useState("");
  const [predicate, setPredicate] = useState<LocationPredicate>("intersects");
  const [metres, setMetres] = useState("1000");
  const [other, setOther] = useState<ToolInput>(() => defaultInput(layerId));

  const submit = async () => {
    if (kind === "expression") await selectByExpression(layerId, where, mode);
    else await selectByLocation(layerId, predicate, other, mode, Number(metres));
    layers.setActive(layerId);
  };

  return (
    <FormModal
      title={kind === "expression" ? "Select by expression" : "Select by location"}
      action="Select"
      busyAction="Selecting…"
      canSubmit={Boolean(layerId) && (kind === "location" || where.trim().length > 0)}
      onSubmit={submit}
      onClose={onClose}
      note={
        kind === "expression" ? (
          <>
            A SQL condition on the layer's columns, e.g.{" "}
            <code className="font-mono text-[0.95em]">population &gt; 1000000 AND country = 'DE'</code>
          </>
        ) : (
          "Selects features of the layer by how they relate to the features of another layer."
        )
      }
    >
      <SelectField
        label={kind === "expression" ? "Layer" : "Select features from"}
        value={layerId}
        options={inputLayers().map((l) => ({ value: l.id, label: l.name }))}
        onChange={setLayerId}
      />
      {kind === "expression" ? (
        <label className="flex flex-col gap-2">
          <FieldLabel>Expression</FieldLabel>
          <textarea
            className={`${INPUT} font-mono min-h-[72px]`}
            spellCheck={false}
            autoFocus
            value={where}
            placeholder="population > 1000000"
            onChange={(e) => setWhere(e.target.value)}
          />
        </label>
      ) : (
        <>
          <SelectField label="where the features" value={predicate} options={PREDICATES} onChange={setPredicate} />
          {predicate === "dwithin" && (
            <TextField
              label="Distance (m)"
              type="number"
              min={0}
              step="any"
              value={metres}
              onChange={(e) => setMetres(e.target.value)}
            />
          )}
          <LayerInput label="the features of" value={other} onChange={setOther} />
        </>
      )}
      <SelectField label="Mode" value={mode} options={MODES} onChange={setMode} />
    </FormModal>
  );
}
