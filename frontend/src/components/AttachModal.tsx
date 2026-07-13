import { useEffect, useState } from "react";
import { attach, aliasFromPath } from "../lib/attach";

// Attach a DuckDB database file to the catalog (T-007). A form over
// `attach.run`: a server-side file path, an optional alias (defaults to the
// filename stem), and a read-only toggle (default on). Owns the async attach so
// it can show inline errors and stay open on failure; on success it refreshes
// the catalog via `onAttached` and closes.

export function AttachModal({
  onClose,
  onAttached,
}: {
  onClose: () => void;
  onAttached: () => void;
}) {
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canAttach = path.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canAttach) return;
    setBusy(true);
    setError(null);
    try {
      await attach.run({ path, alias: alias.trim() || undefined, readOnly });
      onAttached();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attach-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="attach-title">Attach database</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Database file path</span>
            <input
              className="text-input"
              type="text"
              value={path}
              placeholder="/data/example.duckdb"
              spellCheck={false}
              autoFocus
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </label>

          <label className="field">
            <span className="field-label">Alias (optional)</span>
            <input
              className="text-input"
              type="text"
              value={alias}
              placeholder={path.trim() ? aliasFromPath(path) : "database name"}
              spellCheck={false}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            <span>Read-only</span>
          </label>

          {error && <p className="modal-note err">{error}</p>}

          <p className="modal-note">
            The path is on the server (the DuckDB extension host), not this
            browser — a file picker needs a server-side browse endpoint (not yet
            available). Attaches with <code>ATTACH</code>; the database and its
            tables appear in the Browser tree once attached.
          </p>
        </div>

        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!canAttach} onClick={() => void submit()}>
            {busy ? "Attaching…" : "Attach"}
          </button>
        </div>
      </div>
    </div>
  );
}
