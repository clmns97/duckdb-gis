import { useState, useSyncExternalStore } from "react";
import {
  OVERTURE_THEMES,
  OVERTURE_RELEASES,
  isLargeExtent,
  viewportBbox,
  type ExtentMode,
  type OvertureRequest,
} from "../lib/overture";
import { selection } from "../lib/selection";
import { Modal, Button, ModalNote } from "./Modal";
import { OvertureLogo } from "./OvertureLogo";

// Overture quick-load form (T-012), QuickOSM-style: pick theme(s), a release
// (latest preselected), and an extent, then Load. Purely a form — it collects
// an OvertureRequest and hands it to `onLoad`; App resolves the extent bbox,
// builds the query and routes the result through the layers store. Extent
// resolution + the S3 query itself are the T-008 data path (see lib/overture).

const FIELD = "flex flex-col gap-2 m-0 p-0 border-0";
const LEGEND = "p-0 text-sm font-medium text-gray-500";

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

  // Warn when the viewport extent is large enough that the direct-read path
  // globs the whole-planet fileset and takes minutes (T-029). Captured on open
  // (the map is behind the modal and not being panned); advisory, not blocking.
  const [vpBbox] = useState(viewportBbox);
  const viewportTooLarge = extent === "viewport" && vpBbox != null && isLargeExtent(vpBbox);

  // Enable the "selected feature" extent only when something is selected (T-003).
  const selVersion = useSyncExternalStore(selection.subscribe, () => selection.version);
  void selVersion;
  const selCount = selection.size;

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
    <Modal
      title={
        <span className="flex items-center gap-2">
          <OvertureLogo size={18} className="shrink-0" />
          Add Overture Maps data
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canLoad} onClick={submit}>
            Load
          </Button>
        </>
      }
    >
      <fieldset className={FIELD}>
        <legend className={LEGEND}>Themes</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {OVERTURE_THEMES.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-editor cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary"
                checked={themes.has(t.id)}
                onChange={() => toggleTheme(t.id)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={FIELD}>
        <span className={LEGEND}>Release</span>
        <select
          className="text-editor text-gray-900 px-2 py-1.5 bg-white border border-gray-200 rounded-md"
          value={release}
          onChange={(e) => setRelease(e.target.value)}
        >
          {OVERTURE_RELEASES.map((r, i) => (
            <option key={r} value={r}>
              {r}
              {i === 0 ? " (latest)" : ""}
            </option>
          ))}
        </select>
      </label>

      <fieldset className={FIELD}>
        <legend className={LEGEND}>Extent</legend>
        <label className="flex items-center gap-2 text-editor cursor-pointer">
          <input
            type="radio"
            name="extent"
            className="accent-primary"
            checked={extent === "viewport"}
            onChange={() => setExtent("viewport")}
          />
          <span>Current viewport</span>
        </label>
        <label
          className={`flex items-center gap-2 text-editor ${
            selCount === 0 ? "text-gray-500 cursor-default" : "cursor-pointer"
          }`}
        >
          <input
            type="radio"
            name="extent"
            className="accent-primary"
            checked={extent === "selected"}
            disabled={selCount === 0}
            onChange={() => setExtent("selected")}
          />
          <span>
            Selected feature{selCount === 0 ? "" : ` extent (${selCount})`}
          </span>
        </label>
        <label className="flex items-center gap-2 text-editor text-gray-500 cursor-default">
          <input type="radio" name="extent" className="accent-primary" disabled />
          <span>Named place — coming soon</span>
        </label>
      </fieldset>

      {viewportTooLarge && (
        <p className="m-0 text-xs text-amber-600">
          This extent is large — the load reads Overture's whole-planet files and
          may take minutes (or stall on heavy themes like Buildings). Zoom in to a
          city before loading for a fast result.
        </p>
      )}

      <ModalNote>
        Data is fetched from Overture GeoParquet on S3, clipped to the chosen
        extent. Large extents or heavy themes (Buildings, Transportation) can
        take minutes; zoom in to narrow the extent.
      </ModalNote>
    </Modal>
  );
}
