import { useEffect, useState, useSyncExternalStore } from "react";
import { FormModal, FieldLabel, TextField, INPUT } from "./Modal";
import { layers } from "../lib/layers";
import { selection } from "../lib/selection";
import {
  freeTableName,
  inputFields,
  inputLayers,
  runTool,
  type GeoTool,
  type Param,
  type ParamValue,
  type ToolInput,
} from "../lib/geoprocessing";

// The dialog every processing tool opens (#111), built from its registry entry:
// the input layer (default: the active one) with "Selected features only", one
// field per parameter, and the output table's name. Run writes the result to a
// new table and adds it as a layer (`runTool`).

const defaults = (tool: GeoTool): Record<string, ParamValue> =>
  Object.fromEntries(
    tool.params.flatMap((p) =>
      p.kind === "layer" ? [] : [[p.key, p.kind === "field" ? "" : p.default]],
    ),
  );

/** Picks an input layer plus its "Selected features only" switch. */
export function LayerInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ToolInput;
  onChange: (v: ToolInput) => void;
}) {
  const n = selection.size(value.layerId);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <FieldLabel>{label}</FieldLabel>
        <select
          className={INPUT}
          value={value.layerId}
          onChange={(e) =>
            onChange({ layerId: e.target.value, selectedOnly: selection.size(e.target.value) > 0 })
          }
        >
          {inputLayers().map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-editor text-gray-700">
        <input
          type="checkbox"
          checked={value.selectedOnly && n > 0}
          disabled={n === 0}
          onChange={(e) => onChange({ ...value, selectedOnly: e.target.checked })}
        />
        Selected features only{n > 0 ? ` (${n})` : ""}
      </label>
    </div>
  );
}

function ParamField({
  param,
  value,
  fields,
  onChange,
}: {
  param: Exclude<Param, { kind: "layer" }>;
  value: ParamValue;
  fields: string[];
  onChange: (v: ParamValue) => void;
}) {
  switch (param.kind) {
    case "number":
      return (
        <TextField
          label={param.unit ? `${param.label} (${param.unit})` : param.label}
          type="number"
          step="any"
          min={param.min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "text":
      return (
        <TextField
          label={param.label}
          value={value}
          placeholder={param.hint}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "field":
    case "choice": {
      const options =
        param.kind === "field"
          ? [...(param.optional ? [{ value: "", label: "— none —" }] : []), ...fields.map((f) => ({ value: f, label: f }))]
          : param.options;
      return (
        <label className="flex flex-col gap-2">
          <FieldLabel>{param.label}</FieldLabel>
          <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    }
  }
}

export function ProcessingModal({ tool, onClose }: { tool: GeoTool; onClose: () => void }) {
  useSyncExternalStore(selection.subscribe, () => selection.version);
  const candidates = inputLayers();
  const first = (avoid?: string): ToolInput => {
    const id =
      [layers.activeId, ...candidates.map((l) => l.id)].find((x) => x && x !== avoid && candidates.some((l) => l.id === x)) ??
      candidates[0]?.id ??
      "";
    return { layerId: id, selectedOnly: selection.size(id) > 0 };
  };

  const [inputs, setInputs] = useState<Record<string, ToolInput>>(() => {
    const main = first();
    const out: Record<string, ToolInput> = { input: main };
    for (const p of tool.params) if (p.kind === "layer") out[p.key] = first(main.layerId);
    return out;
  });
  const [values, setValues] = useState(() => defaults(tool));
  const [fields, setFields] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [outputTouched, setOutputTouched] = useState(false);

  const inputId = inputs.input?.layerId ?? "";
  const inputName = layers.get(inputId)?.name ?? "";

  // Field choices follow the input layer.
  useEffect(() => {
    if (!inputId || !tool.params.some((p) => p.kind === "field")) return;
    let live = true;
    inputFields(inputId)
      .then((f) => live && setFields(f))
      .catch(() => live && setFields([]));
    return () => {
      live = false;
    };
  }, [inputId, tool]);

  // Suggest a free output name from the input layer and tool, until edited.
  useEffect(() => {
    if (outputTouched || !inputName) return;
    let live = true;
    freeTableName(`${inputName}_${tool.id}`)
      .then((n) => live && setOutput(n))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [inputName, tool, outputTouched]);

  const textOk = tool.params.every(
    (p) => p.kind !== "text" || !p.pattern || p.pattern.test(String(values[p.key])),
  );
  const canSubmit = Boolean(inputId) && output.trim().length > 0 && textOk;

  return (
    <FormModal
      title={tool.label}
      action="Run"
      busyAction="Running…"
      canSubmit={canSubmit}
      onSubmit={() => runTool(tool, inputs, values, output.trim())}
      onClose={onClose}
      note={
        candidates.length === 0
          ? "Add a layer to the map first. Overture tile layers need “Create Layer from Selection” first."
          : `${tool.description} The result is a new layer; the input is not changed.`
      }
    >
      <LayerInput
        label="Input layer"
        value={inputs.input}
        onChange={(v) => setInputs({ ...inputs, input: v })}
      />
      {tool.params.map((p) =>
        p.kind === "layer" ? (
          <LayerInput
            key={p.key}
            label={p.label}
            value={inputs[p.key]}
            onChange={(v) => setInputs({ ...inputs, [p.key]: v })}
          />
        ) : (
          <ParamField
            key={p.key}
            param={p}
            value={values[p.key]}
            fields={fields}
            onChange={(v) => setValues({ ...values, [p.key]: v })}
          />
        ),
      )}
      <TextField
        label="Output layer"
        value={output}
        onChange={(e) => {
          setOutputTouched(true);
          setOutput(e.target.value);
        }}
      />
    </FormModal>
  );
}
