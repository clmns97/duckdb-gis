import { useState } from "react";
import { attach, aliasFromPath } from "../lib/attach";
import { Modal, Button, FieldLabel, ModalNote, INPUT } from "./Modal";

// Attach a DuckDB database file to the catalog (T-007). A form over
// `attach.run`: a server-side file path and an optional alias (defaults to the
// filename stem). Always attaches read-only (#66) — there is no toggle for
// this; a source becomes writable only for the span of an explicit edit
// session on one of its tables. Owns the async attach so it can show inline
// errors and stay open on failure; on success it refreshes the catalog via
// `onAttached` and closes.

export function AttachModal({
  onClose,
  onAttached,
}: {
  onClose: () => void;
  onAttached: () => void;
}) {
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAttach = path.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canAttach) return;
    setBusy(true);
    setError(null);
    try {
      await attach.run({ path, alias: alias.trim() || undefined });
      onAttached();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Attach database"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canAttach} onClick={() => void submit()}>
            {busy ? "Attaching…" : "Attach"}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-2">
        <FieldLabel>Database file path</FieldLabel>
        <input
          className={INPUT}
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

      <label className="flex flex-col gap-2">
        <FieldLabel>Alias (optional)</FieldLabel>
        <input
          className={INPUT}
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

      {error && <ModalNote error>{error}</ModalNote>}

      <ModalNote>
        The path is on the server (the DuckDB extension host), not this browser —
        a file picker needs a server-side browse endpoint (not yet available).
        Attaches read-only with{" "}
        <code className="font-mono text-[0.95em]">ATTACH … (READ_ONLY)</code>; the
        database and its tables appear in the Browser tree once attached. Toggle
        editing on a layer from this source to edit it in place — the database
        becomes writable only for that session, then goes back to read-only.
      </ModalNote>
    </Modal>
  );
}
