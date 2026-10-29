import { useEffect, useState, useSyncExternalStore } from "react";
import {
  layers,
  loadLayerInfo,
  type ActiveLayer,
  type LayerInfo,
  type LayerStyle,
} from "../lib/layers";
import { Modal, Button, ModalNote } from "./Modal";
import { errMsg } from "../lib/duckdb";

// Layer Properties dialog (QGIS's Layer Properties). Two tabs sharing one
// surface, as QGIS co-locates them: **Information** (read-only source /
// geometry / attributes / extent — T-011) and **Symbology** (single-symbol
// styling — T-010). Opened from the Layers-panel context menu for one layer.

type Tab = "information" | "symbology";

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const rgbToHex = ([r, g, b]: [number, number, number]) =>
  "#" + [r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("");
const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [99, 102, 241];
};

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`text-sm border-b-2 pb-2 pt-2 px-1 -mb-px cursor-pointer hover:text-gray-900 ${
        active ? "text-gray-900 border-accent" : "text-gray-500 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

export function LayerProperties({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("information");

  // Re-render on store changes so live style edits reflect immediately and the
  // dialog closes itself if the layer is removed underneath it.
  const version = useSyncExternalStore(layers.subscribe, () => layers.version);
  void version;
  const layer = layers.get(layerId);

  useEffect(() => {
    if (!layer) onClose(); // layer removed while open
  }, [layer, onClose]);
  if (!layer) return null;

  return (
    <Modal
      title={`Layer Properties — ${layer.name}`}
      onClose={onClose}
      width={460}
      subhead={
        <div className="flex gap-1 px-4 border-b border-gray-200" role="tablist" aria-label="Layer properties">
          <TabButton active={tab === "information"} onClick={() => setTab("information")}>
            Information
          </TabButton>
          <TabButton active={tab === "symbology"} onClick={() => setTab("symbology")}>
            Symbology
          </TabButton>
        </div>
      }
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {tab === "information" ? (
        <InformationTab layer={layer} />
      ) : (
        <SymbologyTab layer={layer} />
      )}
    </Modal>
  );
}

function InformationTab({ layer }: { layer: ActiveLayer }) {
  const [info, setInfo] = useState<LayerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load lazily when the tab mounts — count/extent can be costly on large
  // tables, so it must not block the UI (T-011). Guarded against a late resolve
  // after the dialog closes / layer changes.
  useEffect(() => {
    let live = true;
    setInfo(null);
    setError(null);
    loadLayerInfo(layer)
      .then((i) => live && setInfo(i))
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [layer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = layer.source;
  const extent = layer.bounds
    ? layer.bounds.map((n) => n.toFixed(5)).join(", ")
    : "—";

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 m-0 text-editor">
      <Row label="Source">
        {s ? `${s.db}.${s.schema}.${s.table}` : `${layer.name} (query)`}
      </Row>
      {s && <Row label="Geometry column">{s.geomColumn}</Row>}
      <Row label="Geometry type">
        {error ? "—" : info ? info.geometryType ?? "unknown" : "…"}
      </Row>
      <Row label="Feature count">
        {error ? "—" : info ? (info.featureCount ?? "—").toLocaleString() : "…"}
      </Row>
      <Row label="Extent">{extent}</Row>
      <Row label="CRS">EPSG:4326 (assumed)</Row>

      <dt className="col-span-full mt-2 pt-2 border-t border-gray-200 font-medium text-gray-500">
        Attributes
      </dt>
      <dd className="col-span-full m-0">
        {error ? (
          <span className="text-editor text-danger">Couldn’t load: {error}</span>
        ) : !info ? (
          <span className="text-editor text-gray-500 italic">Loading…</span>
        ) : !info.fromSource ? (
          <span className="text-editor text-gray-500 italic">Not available for query-backed layers.</span>
        ) : info.columns.length === 0 ? (
          <span className="text-editor text-gray-500 italic">No columns.</span>
        ) : (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {info.columns.map((c) => (
                <tr key={c.name}>
                  <td className="py-[3px] pr-2 pl-0 border-b border-gray-200">{c.name}</td>
                  <td className="py-[3px] pr-2 pl-0 border-b border-gray-200 text-gray-500 font-mono text-right whitespace-nowrap">
                    {c.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </dd>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="m-0 break-words">{children}</dd>
    </>
  );
}

function SymRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-editor">
      <span className="text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function SymbologyTab({ layer }: { layer: ActiveLayer }) {
  const style = layer.style;
  if (!style)
    return <p className="mt-0.5 text-editor text-gray-500 italic">Style unavailable (layer still loading).</p>;

  const set = (changes: Partial<LayerStyle>) => layers.setStyle(layer.id, changes);
  const color = (label: string, key: "fillColor" | "lineColor") => (
    <SymRow label={label}>
      <input
        type="color"
        className="w-10 h-6 p-0 border border-gray-200 rounded-sm bg-transparent cursor-pointer"
        value={rgbToHex(style[key])}
        onChange={(e) => set({ [key]: hexToRgb(e.target.value) })}
      />
    </SymRow>
  );
  const range = (
    label: string,
    key: "fillOpacity" | "lineWidth" | "pointRadius",
    [min, max, step]: [number, number, number],
    show: (v: number) => string,
  ) => (
    <SymRow label={label}>
      <span className="flex items-center gap-2">
        <input
          type="range"
          className="accent-primary w-40"
          min={min}
          max={max}
          step={step}
          value={style[key]}
          onChange={(e) => set({ [key]: Number(e.target.value) })}
        />
        <output className="min-w-[42px] text-right text-gray-500 tabular-nums">{show(style[key])}</output>
      </span>
    </SymRow>
  );

  return (
    <div className="flex flex-col gap-3">
      {color("Fill color", "fillColor")}
      {color("Line color", "lineColor")}
      {range("Opacity", "fillOpacity", [0, 1, 0.05], (v) => `${Math.round(v * 100)}%`)}
      {range("Line width", "lineWidth", [0, 8, 0.5], (v) => `${v} px`)}
      {range("Point size", "pointRadius", [1, 12, 1], (v) => `${v} px`)}

      <ModalNote>
        Single-symbol styling. Categorized / graduated (data-driven) styling is a
        later follow-up. Point size applies to point layers, line width to lines
        and outlines.
      </ModalNote>
    </div>
  );
}
