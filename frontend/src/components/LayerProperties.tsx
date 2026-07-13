import { useEffect, useState, useSyncExternalStore } from "react";
import {
  layers,
  loadLayerInfo,
  type ActiveLayer,
  type LayerInfo,
  type LayerStyle,
} from "../lib/layers";

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

export function LayerProperties({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("information");

  // Re-render on store changes so live style edits reflect immediately and the
  // dialog closes itself if the layer is removed underneath it.
  const version = useSyncExternalStore(layers.subscribe, () => layers.version);
  void version;
  const layer = layers.list().find((l) => l.id === layerId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!layer) onClose(); // layer removed while open
  }, [layer, onClose]);
  if (!layer) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal lp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="lp-title">Layer Properties — {layer.name}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="lp-tabs" role="tablist" aria-label="Layer properties">
          <button
            role="tab"
            aria-selected={tab === "information"}
            className={`lp-tab${tab === "information" ? " active" : ""}`}
            onClick={() => setTab("information")}
          >
            Information
          </button>
          <button
            role="tab"
            aria-selected={tab === "symbology"}
            className={`lp-tab${tab === "symbology" ? " active" : ""}`}
            onClick={() => setTab("symbology")}
          >
            Symbology
          </button>
        </div>

        <div className="modal-body">
          {tab === "information" ? (
            <InformationTab layer={layer} />
          ) : (
            <SymbologyTab layer={layer} />
          )}
        </div>

        <div className="modal-foot">
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
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
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [layer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = layer.source;
  const extent = layer.bounds
    ? layer.bounds.map((n) => n.toFixed(5)).join(", ")
    : "—";

  return (
    <dl className="lp-info">
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

      <dt className="lp-info-head">Attributes</dt>
      <dd className="lp-info-attrs">
        {error ? (
          <span className="empty err">Couldn’t load: {error}</span>
        ) : !info ? (
          <span className="empty">Loading…</span>
        ) : !info.fromSource ? (
          <span className="empty">Not available for query-backed layers.</span>
        ) : info.columns.length === 0 ? (
          <span className="empty">No columns.</span>
        ) : (
          <table className="lp-attr-table">
            <tbody>
              {info.columns.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="lp-attr-type">{c.type}</td>
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
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function SymbologyTab({ layer }: { layer: ActiveLayer }) {
  const style = layer.style;
  if (!style) return <p className="empty">Style unavailable (layer still loading).</p>;

  const set = (changes: Partial<LayerStyle>) => layers.setStyle(layer.id, changes);

  return (
    <div className="lp-sym">
      <label className="lp-sym-row">
        <span>Fill color</span>
        <input
          type="color"
          value={rgbToHex(style.fillColor)}
          onChange={(e) => set({ fillColor: hexToRgb(e.target.value) })}
        />
      </label>

      <label className="lp-sym-row">
        <span>Line color</span>
        <input
          type="color"
          value={rgbToHex(style.lineColor)}
          onChange={(e) => set({ lineColor: hexToRgb(e.target.value) })}
        />
      </label>

      <label className="lp-sym-row">
        <span>Opacity</span>
        <span className="lp-sym-control">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={style.fillOpacity}
            onChange={(e) => set({ fillOpacity: Number(e.target.value) })}
          />
          <output>{Math.round(style.fillOpacity * 100)}%</output>
        </span>
      </label>

      <label className="lp-sym-row">
        <span>Line width</span>
        <span className="lp-sym-control">
          <input
            type="range"
            min={0}
            max={8}
            step={0.5}
            value={style.lineWidth}
            onChange={(e) => set({ lineWidth: Number(e.target.value) })}
          />
          <output>{style.lineWidth} px</output>
        </span>
      </label>

      <label className="lp-sym-row">
        <span>Point size</span>
        <span className="lp-sym-control">
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={style.pointRadius}
            onChange={(e) => set({ pointRadius: Number(e.target.value) })}
          />
          <output>{style.pointRadius} px</output>
        </span>
      </label>

      <p className="modal-note">
        Single-symbol styling. Categorized / graduated (data-driven) styling is a
        later follow-up. Point size applies to point layers, line width to lines
        and outlines.
      </p>
    </div>
  );
}
