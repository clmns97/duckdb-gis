import { useEffect, useState, useSyncExternalStore } from "react";
import {
  OVERTURE_THEMES,
  OVERTURE_RELEASES,
  type ExtentMode,
  type OvertureRequest,
} from "../lib/overture";
import { selection } from "../lib/selection";

// Overture quick-load form (T-012), QuickOSM-style: pick theme(s), a release
// (latest preselected), and an extent, then Load. Purely a form — it collects
// an OvertureRequest and hands it to `onLoad`; App resolves the extent bbox,
// builds the query and routes the result through the layers store. Extent
// resolution + the S3 query itself are the T-008 data path (see lib/overture).

export function OvertureModal({
  onClose,
  onLoad,
}: {
  onClose: () => void;
  onLoad: (request: OvertureRequest) => void;
}) {
  const [themes, setThemes] = useState<Set<string>>(new Set());
  const [release, setRelease] = useState(OVERTURE_RELEASES[0]);
  const [extent, setExtent] = useState<ExtentMode>("viewport");

  // Enable the "selected feature" extent only when something is selected (T-003).
  const selVersion = useSyncExternalStore(selection.subscribe, () => selection.version);
  void selVersion;
  const selCount = selection.size;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleTheme = (id: string) => {
    setThemes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canLoad = themes.size > 0 && !(extent === "selected" && selCount === 0);

  const submit = () => {
    if (!canLoad) return;
    onLoad({ themes: [...themes], release, extent });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="overture-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="overture-title">Add Overture Maps data</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <fieldset className="field">
            <legend>Themes</legend>
            <div className="theme-grid">
              {OVERTURE_THEMES.map((t) => (
                <label key={t.id} className="check">
                  <input
                    type="checkbox"
                    checked={themes.has(t.id)}
                    onChange={() => toggleTheme(t.id)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span className="field-label">Release</span>
            <select value={release} onChange={(e) => setRelease(e.target.value)}>
              {OVERTURE_RELEASES.map((r, i) => (
                <option key={r} value={r}>
                  {r}
                  {i === 0 ? " (latest)" : ""}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="field">
            <legend>Extent</legend>
            <label className="radio">
              <input
                type="radio"
                name="extent"
                checked={extent === "viewport"}
                onChange={() => setExtent("viewport")}
              />
              <span>Current viewport</span>
            </label>
            <label className={`radio${selCount === 0 ? " disabled" : ""}`}>
              <input
                type="radio"
                name="extent"
                checked={extent === "selected"}
                disabled={selCount === 0}
                onChange={() => setExtent("selected")}
              />
              <span>
                Selected feature{selCount === 0 ? "" : ` extent (${selCount})`}
              </span>
            </label>
            <label className="radio disabled">
              <input type="radio" name="extent" disabled />
              <span>Named place — coming soon</span>
            </label>
          </fieldset>

          <p className="modal-note">
            Data is fetched from Overture GeoParquet on S3, clipped to the chosen
            extent. Requires the S3/httpfs data path (T-008); until it lands a
            load may report a missing-extension error.
          </p>
        </div>

        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!canLoad} onClick={submit}>
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
