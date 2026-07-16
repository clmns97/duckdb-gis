import { useEffect, useState, useSyncExternalStore } from "react";
import type { IDockviewPanelProps } from "dockview";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { layers, loadLayerInfo, qualified, ident, type LayerColumn } from "../../lib/layers";
import { query, str } from "../../lib/duckdb";
import { Button } from "../Button";
import { TypeGlyph } from "../TypeGlyph";
import { typeKind, isNumeric } from "../../lib/columnTypes";

// QGIS "Open Attribute Table" as a dock tab (T-026): a paged grid of a layer's
// non-geometry attributes. One panel per layer (keyed by id via dockBus). Rows
// are read with LIMIT/OFFSET paging so large tables stay responsive; the
// geometry column is excluded. Query-backed layers (Overture / SQL result) have
// no catalog source to page, so v1 shows a short "not available" note.

const PAGE_SIZE = 100;

type Rows = Awaited<ReturnType<typeof query>>;

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function AttributesPanel(props: IDockviewPanelProps) {
  const layerId = str(props.params.layerId);
  // Re-render on store changes so a removed layer is reflected.
  useSyncExternalStore(layers.subscribe, () => layers.version);
  const layer = layers.list().find((l) => l.id === layerId);
  const source = layer?.source;

  const [columns, setColumns] = useState<LayerColumn[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Columns + total once per layer (the geometry column is dropped for display).
  useEffect(() => {
    if (!layer || !source) return;
    let cancelled = false;
    loadLayerInfo(layer)
      .then((info) => {
        if (cancelled) return;
        setColumns(info.columns.filter((c) => c.name !== source.geomColumn));
        setTotal(info.featureCount);
      })
      .catch((e) => !cancelled && setError(msg(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  // The current page of rows. Selects the known non-geometry columns explicitly
  // (rather than `* EXCLUDE (geom)`, which errors with "SELECT list is empty" on
  // a geometry-only table) — so it waits for `columns` to resolve first. A table
  // whose only column is the geometry has no attributes to page: skip the query.
  useEffect(() => {
    if (!source || columns == null) return;
    if (columns.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const cols = columns.map((c) => ident(c.name)).join(", ");
    const sql = `SELECT ${cols} FROM ${qualified(source)} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    query(sql)
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setError(null);
      })
      .catch((e) => !cancelled && setError(msg(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, offset, columns]);

  if (!layer) {
    return <Note>This layer is no longer available.</Note>;
  }
  if (!source) {
    return (
      <Note>
        The attribute table is available for catalog tables. “{layer.name}” is a
        query-backed layer, so its rows aren’t browsable here yet.
      </Note>
    );
  }

  // Full column set with types; fall back to inferring names from the first row
  // (query-backed shapes) with an unknown type when metadata isn't loaded yet.
  const displayCols: LayerColumn[] =
    columns ??
    (rows && rows.length > 0
      ? Object.keys(rows[0] as object).map((name) => ({ name, type: "" }))
      : []);
  const from = rows && rows.length > 0 ? offset + 1 : 0;
  const to = offset + (rows?.length ?? 0);
  const hasNext = total != null ? offset + PAGE_SIZE < total : (rows?.length ?? 0) === PAGE_SIZE;
  // A table whose only column is the geometry has nothing to tabulate.
  const geometryOnly = columns != null && columns.length === 0;

  return (
    <div className="h-full flex flex-col bg-white text-sm">
      <div className="flex items-center gap-3 px-3 h-9 border-b border-gray-200 shrink-0">
        <span className="font-medium">{layer.name}</span>
        <span className="text-gray-500">
          {total != null ? `${total.toLocaleString()} rows` : "…"}
          {rows ? ` · showing ${from.toLocaleString()}–${to.toLocaleString()}` : ""}
        </span>
        <span className="flex-1" />
        <Button
          variant="icon"
          title="Previous page"
          aria-label="Previous page"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </Button>
        <Button
          variant="icon"
          title="Next page"
          aria-label="Next page"
          disabled={!hasNext || loading}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </Button>
      </div>

      {error ? (
        <Note danger>{error}</Note>
      ) : geometryOnly ? (
        <Note>
          “{layer.name}” has only a geometry column, so there are no attributes to
          tabulate{total != null ? ` (${total.toLocaleString()} features)` : ""}.
        </Note>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 h-7 px-2 bg-grid-cell border-b border-r border-hairline text-gray-500 font-medium text-right select-none">
                  #
                </th>
                {displayCols.map((c) => (
                  <th
                    key={c.name}
                    className="h-7 px-2 bg-grid-cell border-b border-r border-hairline text-gray-500 font-medium text-left whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1.5">
                      <TypeGlyph type={c.type} />
                      {c.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, i) => (
                <tr key={offset + i} className="group">
                  <td className="sticky left-0 z-[1] h-7 px-2 bg-white group-hover:bg-grid-cell border-b border-r border-hairline text-gray-500 text-right tabular-nums select-none">
                    {offset + i + 1}
                  </td>
                  {displayCols.map((c) => {
                    const num = isNumeric(typeKind(c.type));
                    return (
                      <td
                        key={c.name}
                        className={`h-7 px-2 border-b border-r border-hairline text-gray-900 whitespace-nowrap max-w-[420px] overflow-hidden text-ellipsis group-hover:bg-grid-cell ${
                          num ? "text-right tabular-nums" : "text-left"
                        }`}
                        title={str((row as Record<string, unknown>)[c.name])}
                      >
                        {str((row as Record<string, unknown>)[c.name])}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr>
                  <td
                    className="px-2 py-2 text-gray-500 italic"
                    colSpan={displayCols.length + 1}
                  >
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Note({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div className="h-full grid place-items-center bg-white p-6">
      <p className={`text-editor text-center max-w-sm ${danger ? "text-danger" : "text-gray-500"}`}>
        {children}
      </p>
    </div>
  );
}
