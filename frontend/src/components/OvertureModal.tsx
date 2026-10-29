import { useEffect, useState } from "react";
import {
  OVERTURE_THEMES,
  listOvertureReleases,
  type OvertureRequest,
} from "../lib/overture";
import { FormModal, ModalNote, INPUT } from "./Modal";
import { errMsg } from "../lib/duckdb";
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
  const [releases, setReleases] = useState<string[] | null>(null);
  const [release, setRelease] = useState("");
  const [listError, setListError] = useState<string | null>(null);

  // Live-list the releases available in *both* the tiles and GeoParquet buckets
  // (T-058). Load stays disabled until they arrive: a guessed release may
  // already have been rotated out of the buckets (#30).
  useEffect(() => {
    let alive = true;
    listOvertureReleases()
      .then((list) => {
        if (!alive) return;
        setReleases(list);
        setRelease(list[0]);
      })
      .catch((e) => alive && setListError(`Couldn't list Overture releases: ${errMsg(e)}`));
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

  return (
    <FormModal
      title={
        <span className="flex items-center gap-2">
          <OvertureLogo size={18} className="shrink-0" />
          Add Overture Maps data
        </span>
      }
      action="Load"
      canSubmit={themes.size > 0 && release !== ""}
      onSubmit={() => onLoad({ themes: [...themes], release })}
      onClose={onClose}
      note={
        <>
          Themes render from Overture's hosted, pre-tiled data — the whole planet is
          available, just pan and zoom. To edit features, select them on the map and
          use “Create Layer from Selection”.
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
          disabled={!releases}
          onChange={(e) => setRelease(e.target.value)}
        >
          {!releases && <option value="">{listError ? "unavailable" : "Loading releases…"}</option>}
          {releases?.map((r, i) => (
            <option key={r} value={r}>
              {r}
              {i === 0 ? " (latest)" : ""}
            </option>
          ))}
        </select>
      </label>
      {listError && <ModalNote error>{listError}</ModalNote>}

    </FormModal>
  );
}
