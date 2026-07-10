import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { renderGeoArrow } from "../lib/deckRender";

const DEFAULT_SQL = `SELECT 'Zürich' AS name, ST_Point(8.54, 47.37) AS geom
UNION ALL SELECT 'Bern', ST_Point(7.45, 46.95)
UNION ALL SELECT 'Geneva', ST_Point(6.14, 46.20);`;

type Status = { kind: "idle" | "running" | "ok" | "err"; msg: string };

export function EditorPanel() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle", msg: "⌘/Ctrl+↵ to run" });

  const run = async () => {
    const text = view.current?.state.doc.toString() ?? "";
    if (!text.trim()) return;
    setStatus({ kind: "running", msg: "Running…" });
    try {
      const t0 = performance.now();
      const { featureCount } = await renderGeoArrow(text);
      const ms = Math.round(performance.now() - t0);
      setStatus({ kind: "ok", msg: `${featureCount} feature${featureCount === 1 ? "" : "s"} · ${ms} ms` });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    if (!host.current) return;
    const runKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          void run();
          return true;
        },
      },
    ]);
    const v = new EditorView({
      doc: DEFAULT_SQL,
      extensions: [basicSetup, sql({ dialect: PostgreSQL }), runKeymap],
      parent: host.current,
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="editor-panel">
      <div className="editor-toolbar">
        <button className="run-btn" onClick={() => void run()}>
          <span aria-hidden="true">▶</span> Run <span className="kbd">⌘↵</span>
        </button>
        <span className={`run-status ${status.kind}`}>{status.msg}</span>
      </div>
      <div className="editor-host" ref={host} />
    </div>
  );
}
