import { useEffect, useState } from "react";
import {
  OVERTURE_THEMES,
  OVERTURE_RELEASES,
  listOvertureReleases,
  type OvertureRequest,
} from "../lib/overture";
import { Modal, Button, ModalNote, INPUT } from "./Modal";
import { OvertureLogo } from "./OvertureLogo";

// Overture quick-load form (T-012, rebuilt on PMTiles in T-058), QuickOSM-style:
// pick theme(s) + a release, then Load. Each theme is added as a native MapLibre
// vector-tile layer sourced from Overture's hosted PMTiles — the whole planet is
// available by panning, so there is no extent to choose (the T-012 extent control
// is gone). Editing happens via select-features → "Create Layer from Selection".

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
  const [releases, setReleases] = useState<string[]>(OVERTURE_RELEASES);
  const [release, setRelease] = useState(OVERTURE_RELEASES[0]);

  // Live-list the releases available in *both* the tiles and GeoParquet buckets
  // (T-058); fall back to the pinned default if listing fails.
  useEffect(() => {
    let alive = true;
    void listOvertureReleases().then((list) => {
      if (!alive || list.length === 0) return;
      setReleases(list);
      setRelease((cur) => (list.includes(cur) ? cur : list[0]));
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleTheme = (id: string) => {
    setThemes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canLoad = themes.size > 0;

  const submit = () => {
    if (!canLoad) return;
    onLoad({ themes: [...themes], release });
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
          className={INPUT}
          value={release}
          onChange={(e) => setRelease(e.target.value)}
        >
          {releases.map((r, i) => (
            <option key={r} value={r}>
              {r}
              {i === 0 ? " (latest)" : ""}
            </option>
          ))}
        </select>
      </label>

      <ModalNote>
        Themes render from Overture's hosted, pre-tiled data — the whole planet is
        available, just pan and zoom. To edit features, select them on the map and
        use “Create Layer from Selection”.
      </ModalNote>
    </Modal>
  );
}
