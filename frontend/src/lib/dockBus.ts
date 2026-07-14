import type { DockviewApi } from "dockview";
import type { ActiveLayer } from "./layers";

// Minimal registry so non-dock components (e.g. the Layers panel) can open dock
// tabs without threading the DockviewApi through props — mirrors `mapBus`. The
// single dock instance registers its api here in `Dock.onReady`.
let apiRef: DockviewApi | null = null;

export function setDockApi(api: DockviewApi | null): void {
  apiRef = api;
}

export function getDockApi(): DockviewApi | null {
  return apiRef;
}

/** Stable dock-panel id for a layer's attribute table (one tab per layer). */
export function attributesPanelId(layerId: string): string {
  return `attr-${layerId}`;
}

/**
 * Open (or reveal) the attribute table for a layer as a dock tab — QGIS's
 * "Open Attribute Table" (T-026). Opening the same layer twice reveals the
 * existing tab instead of adding a duplicate. No-op if the dock isn't ready.
 */
export function openAttributes(layer: ActiveLayer): void {
  const api = apiRef;
  if (!api) return;
  const id = attributesPanelId(layer.id);
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  api.addPanel({
    id,
    component: "attributes",
    title: layer.name,
    params: { layerId: layer.id },
  });
}
