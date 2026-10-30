// ---------------------------------------------------------------------------
// Select Features tool (#110) — the map gestures that fill the selection store.
//
// Everything acts on the **active layer** only (QGIS), whatever its kind: deck
// layers hit-test through `pickDeckRect`, Overture PMTiles through
// `pickTileRect`.
//
//   • Normal mode: a click selects the feature under it (Shift adds/removes);
//     a click on empty map clears. Deck layers handle this in `deckRender`'s
//     own click handler; PMTiles layers here.
//   • Select mode (the on-canvas toggle): a tap toggles one feature and a drag
//     draws a box whose features are added (Alt+drag removes them). Pointer
//     events, so it works with a finger as well as a mouse — no Shift needed.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";
import { changeSignal } from "./store";
import { selection, type Pick, type SelectMode } from "./selection";
import { layers } from "./layers";
import { isDeckLayer, pickDeckRect, setPickableLayer, setSelectGate } from "./deckRender";
import { pickTileRect } from "./overtureTiles";
import { getMap } from "./mapBus";

let on = false;
const modeChanges = changeSignal();

export const selectTool = {
  get active(): boolean {
    return on;
  },
  toggle(): void {
    selectTool.set(!on);
  },
  set(next: boolean): void {
    if (next === on) return;
    on = next;
    // Pan is off in select mode so a one-finger / mouse drag draws the box.
    const map = getMap();
    if (map) {
      if (on) map.dragPan.disable();
      else map.dragPan.enable();
      // …and a touch drag must reach us instead of scrolling the page.
      map.getCanvasContainer().style.touchAction = on ? "none" : "";
    }
    modeChanges.emit();
  },
  subscribe: modeChanges.subscribe,
};

setSelectGate(() => on);
// Only the active layer is pickable, so clicks reach it through other layers.
layers.subscribe(() => setPickableLayer(layers.activeId));

/** Features of the active layer inside a canvas-pixel rect (corners a, b). */
function pickActive(a: maplibregl.Point, b: maplibregl.Point): { layerId: string; picks: Pick[] } | null {
  const layerId = layers.activeId;
  if (!layerId) return null;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const picks = isDeckLayer(layerId)
    ? pickDeckRect(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y))
    : pickTileRect(layerId, a, b);
  return { layerId, picks };
}

// A tap/click hit-tests a few pixels around the point, so thin lines and small
// points are reachable with a finger; only the topmost feature counts.
const TAP_SLOP = 4;
function tapAt(p: maplibregl.Point, mode: SelectMode): void {
  const d = new maplibregl.Point(TAP_SLOP, TAP_SLOP);
  const hit = pickActive(p.sub(d), p.add(d));
  if (!hit) return;
  if (hit.picks.length) selection.select(hit.layerId, hit.picks.slice(0, 1), mode);
  else if (mode === "replace") selection.clear(hit.layerId);
}

/** Wire the gestures onto a newly created map. */
export function installSelectTool(map: maplibregl.Map): void {
  selectTool.set(false); // a fresh map starts panning normally

  // Normal mode, PMTiles active layer (deck layers handle their own clicks).
  map.on("click", (e) => {
    const id = layers.activeId;
    if (on || !id || isDeckLayer(id)) return;
    tapAt(e.point, e.originalEvent.shiftKey ? "toggle" : "replace");
  });

  const container = map.getCanvasContainer();
  let start: maplibregl.Point | null = null;
  let pointerId = -1;
  let box: HTMLDivElement | null = null;

  const local = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    return new maplibregl.Point(e.clientX - r.left, e.clientY - r.top);
  };
  const reset = () => {
    box?.remove();
    box = null;
    start = null;
    pointerId = -1;
  };

  container.addEventListener("pointerdown", (e) => {
    if (!on) return;
    if (start) return reset(); // a second finger: a pinch, not a selection
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start = local(e);
    pointerId = e.pointerId;
  });

  container.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== pointerId) return;
    const p = local(e);
    if (!box && start.dist(p) <= TAP_SLOP) return;
    if (!box) {
      box = document.createElement("div");
      box.style.cssText =
        "position:absolute;z-index:5;pointer-events:none;border:1px solid #6366f1;background:rgba(99,102,241,0.2);";
      container.appendChild(box);
    }
    box.style.left = `${Math.min(p.x, start.x)}px`;
    box.style.top = `${Math.min(p.y, start.y)}px`;
    box.style.width = `${Math.abs(p.x - start.x)}px`;
    box.style.height = `${Math.abs(p.y - start.y)}px`;
  });

  container.addEventListener("pointerup", (e) => {
    if (!start || e.pointerId !== pointerId) return;
    const from = start;
    const dragged = box != null;
    reset();
    const p = local(e);
    if (!dragged) return tapAt(p, "toggle");
    const hit = pickActive(from, p);
    if (hit) selection.select(hit.layerId, hit.picks, e.altKey ? "remove" : "add");
  });

  container.addEventListener("pointercancel", reset);
}
