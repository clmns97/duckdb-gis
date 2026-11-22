import { useState } from "react";
import { Globe } from "lucide-react";
import {
  webServices,
  isRasterService,
  SERVICE_TYPE_LABEL,
  VIEW_CAP,
  type Service,
  type ServiceType,
} from "../lib/webServices";
import { FormModal, ModalNote, SelectField, TextField } from "./Modal";

// Add a layer from a web service: QGIS's "Add WFS Layer" and "Add WMS/WMTS
// Layer" in one dialog. Two steps on one form: Connect lists the service's
// layers, then Add layer either fetches the chosen one's features in the current
// map view (WFS, OGC API – Features, ArcGIS REST — via DuckDB into a
// working-catalog table, #121) or draws its images as raster tiles (WMS/WMTS,
// #122). Editing the address or type drops the connection.

const TYPE_OPTIONS: Array<{ value: ServiceType | "auto"; label: string }> = [
  { value: "auto", label: "Detect from address" },
  { value: "wfs", label: SERVICE_TYPE_LABEL.wfs },
  { value: "ogcapi", label: SERVICE_TYPE_LABEL.ogcapi },
  { value: "arcgis", label: SERVICE_TYPE_LABEL.arcgis },
  { value: "wms", label: SERVICE_TYPE_LABEL.wms },
  { value: "wmts", label: SERVICE_TYPE_LABEL.wmts },
];

export function WebServiceModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ServiceType | "auto">("auto");
  const [service, setService] = useState<Service | null>(null);
  const [layerId, setLayerId] = useState("");
  // Features fetched so far while adding — a slow service takes seconds a page.
  const [progress, setProgress] = useState<string | null>(null);
  const raster = service ? isRasterService(service) : type === "wms" || type === "wmts";

  return (
    <FormModal
      title={
        <span className="flex items-center gap-2">
          <Globe size={16} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" />
          Add layer from web service
        </span>
      }
      action={service ? "Add layer" : "Connect"}
      busyAction={service ? (progress ?? (raster ? "Checking the images…" : "Fetching features…")) : "Connecting…"}
      canSubmit={service ? layerId !== "" : url.trim() !== ""}
      onSubmit={async () => {
        if (!service) {
          const s = await webServices.connect(url, type);
          if (s.layers.length === 0) throw new Error("The service lists no feature layers.");
          setService(s);
          setLayerId(s.layers[0].id);
          return false; // stay open to pick a layer
        }
        const layer = service.layers.find((l) => l.id === layerId);
        if (!layer) return false;
        setProgress(null);
        try {
          await webServices.addLayer(service, layer, (fetched, total) => {
            const of = Math.min(total ?? VIEW_CAP, VIEW_CAP);
            setProgress(`Fetching ${fetched.toLocaleString()} of ${of.toLocaleString()}…`);
          });
        } finally {
          setProgress(null);
        }
        onAdded();
      }}
      onClose={onClose}
      note={
        raster ? (
          <>
            The layer's images are drawn straight from the service as the map moves —
            nothing is stored. The map needs the layer in Web Mercator (EPSG:3857), and the
            service must allow browser access to its images (CORS).
          </>
        ) : (
          <>
            DuckDB fetches the features in the current map view (up to{" "}
            {VIEW_CAP.toLocaleString()}) into a table in the working database, so the layer
            works like any other table. Pan or zoom first to choose the area; afterwards the
            layer's menu can refresh it for a new view or download the whole layer. Public
            services only for now.
          </>
        )
      }
    >
      <TextField
        label="Service address"
        value={url}
        placeholder="https://example.org/geoserver/wfs"
        autoFocus
        onChange={(e) => {
          setUrl(e.target.value);
          setService(null);
        }}
      />
      <SelectField
        label="Type"
        value={type}
        options={TYPE_OPTIONS}
        onChange={(v) => {
          setType(v);
          setService(null);
        }}
      />
      {service && (
        <>
          <ModalNote>
            Connected to {service.title} ({SERVICE_TYPE_LABEL[service.type]}
            {service.version ? ` ${service.version}` : ""}).
          </ModalNote>
          <SelectField
            label={`Layer (${service.layers.length})`}
            value={layerId}
            options={service.layers.map((l) => ({
              value: l.id,
              label: (l.title === l.id ? l.id : `${l.title} — ${l.id}`) + (l.unsupported ? " (can't be drawn)" : ""),
            }))}
            onChange={setLayerId}
          />
        </>
      )}
    </FormModal>
  );
}
