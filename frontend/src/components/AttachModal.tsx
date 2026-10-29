import { useState } from "react";
import { attach, aliasFromPath } from "../lib/attach";
import { FormModal, TextField } from "./Modal";

// Attach a DuckDB database file to the catalog (T-007). A form over
// `attach.run`: a server-side file path and an optional alias (defaults to the
// filename stem). Always attaches read-only (#66) — there is no toggle for
// this; a source becomes writable only for the span of an explicit edit
// session on one of its tables. On success it refreshes the catalog via
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
  return (
    <FormModal
      title="Attach database"
      action="Attach"
      busyAction="Attaching…"
      canSubmit={path.trim().length > 0}
      onSubmit={async () => {
        await attach.run({ path, alias: alias.trim() || undefined });
        onAttached();
      }}
      onClose={onClose}
      note={
        <>
          The path is on the server (the DuckDB extension host), not this browser —
          a file picker needs a server-side browse endpoint (not yet available).
          Attaches read-only with{" "}
          <code className="font-mono text-[0.95em]">ATTACH … (READ_ONLY)</code>; the
          database and its tables appear in the Browser tree once attached. Toggle
          editing on a layer from this source to edit it in place — the database
          becomes writable only for that session, then goes back to read-only.
        </>
      }
    >
      <TextField
        label="Database file path"
        value={path}
        placeholder="/data/example.duckdb"
        autoFocus
        onChange={(e) => setPath(e.target.value)}
      />
      <TextField
        label="Alias (optional)"
        value={alias}
        placeholder={path.trim() ? aliasFromPath(path) : "database name"}
        onChange={(e) => setAlias(e.target.value)}
      />
    </FormModal>
  );
}
