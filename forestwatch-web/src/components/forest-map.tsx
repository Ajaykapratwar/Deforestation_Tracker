"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AnalyzeResponse } from "@/types/analysis";

const OSM_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function fixLeafletIcons() {
  const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
  delete proto._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

function boundsFromGeoJSON(g: GeoJSON.Geometry): L.LatLngBoundsExpression | null {
  if (g.type !== "Polygon" || !g.coordinates[0]?.length) return null;
  const ring = g.coordinates[0];
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const c of ring) {
    const [lon, lat] = c as [number, number];
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [24, 24], animate: true, duration: 0.6 });
    }
  }, [map, bounds]);
  return null;
}

export type LayerKey = "ndvi_before" | "ndvi_after" | "ndvi_change" | "deforestation";

type Props = {
  data: AnalyzeResponse | null;
  center: [number, number];
  radiusKm: number;
  zoom: number;
  layers: Record<LayerKey, boolean>;
  compareSplit: number;
  compareMode: boolean;
};

function EeTileLayer({ url, opacity }: { url: string; opacity: number }) {
  return (
    <TileLayer
      url={url}
      opacity={opacity}
      tileSize={256}
      attribution='&copy; <a href="https://earthengine.google.com/">Earth Engine</a>'
    />
  );
}

type MapLayersProps = {
  data: AnalyzeResponse;
  center: [number, number];
  radiusKm: number;
  layers: Record<LayerKey, boolean>;
  /** In single-map mode, show both NDVI as blended when both toggles on */
  ndviMode: "before" | "after" | "blend";
};

function MapLayers({ data, center, radiusKm, layers, ndviMode }: MapLayersProps) {
  const bounds = useMemo(() => boundsFromGeoJSON(data.bounds), [data.bounds]);

  return (
    <>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>' url={OSM_LIGHT} />
      {layers.ndvi_change && (
        <EeTileLayer url={data.layers.ndvi_change.url} opacity={data.layers.ndvi_change.opacity} />
      )}
      {ndviMode === "blend" && layers.ndvi_before && layers.ndvi_after && (
        <>
          <EeTileLayer url={data.layers.ndvi_before.url} opacity={data.layers.ndvi_before.opacity * 0.55} />
          <EeTileLayer url={data.layers.ndvi_after.url} opacity={data.layers.ndvi_after.opacity * 0.55} />
        </>
      )}
      {ndviMode === "before" && layers.ndvi_before && (
        <EeTileLayer url={data.layers.ndvi_before.url} opacity={data.layers.ndvi_before.opacity} />
      )}
      {ndviMode === "after" && layers.ndvi_after && (
        <EeTileLayer url={data.layers.ndvi_after.url} opacity={data.layers.ndvi_after.opacity} />
      )}
      {ndviMode === "blend" && layers.ndvi_before && !layers.ndvi_after && (
        <EeTileLayer url={data.layers.ndvi_before.url} opacity={data.layers.ndvi_before.opacity} />
      )}
      {ndviMode === "blend" && !layers.ndvi_before && layers.ndvi_after && (
        <EeTileLayer url={data.layers.ndvi_after.url} opacity={data.layers.ndvi_after.opacity} />
      )}
      {/* Deforestation layer on top */}
      {layers.deforestation && (
        <EeTileLayer url={data.layers.deforestation.url} opacity={data.layers.deforestation.opacity} />
      )}
      <CircleMarker
        center={center}
        radius={Math.min(48, 12 + radiusKm)}
        pathOptions={{
          color: "#38bdf8",
          weight: 1.5,
          fillColor: "#86efac",
          fillOpacity: 0.06,
        }}
      />
      <Marker position={center}>
        <Popup>AOI center · {radiusKm} km radius</Popup>
      </Marker>
      <FitBounds bounds={bounds} />
    </>
  );
}

export default function ForestMap({
  data,
  center,
  radiusKm,
  zoom,
  layers,
  compareSplit,
  compareMode,
}: Props) {
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      fixLeafletIcons();
      initialized.current = true;
    }
  }, []);

  const showDual = Boolean(
    compareMode && data && layers.ndvi_before && layers.ndvi_after,
  );

  const legend = (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[600] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow-sm">
      <div className="mb-1 font-semibold text-slate-600">Legend</div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
        <span>Greenery (NDVI)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
        <span>Deforestation (Red)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#fb923c]" />
        <span>Deforestation (Orange)</span>
      </div>
    </div>
  );

  if (showDual && data) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="grid h-full gap-px bg-slate-200"
          style={{ gridTemplateColumns: `${compareSplit}fr ${100 - compareSplit}fr` }}
        >
          <div className="relative min-h-0">
            <span className="absolute left-3 top-3 z-[500] rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-700 shadow-sm">
              Before
            </span>
            <MapContainer
              center={center}
              zoom={zoom}
              className="z-0 h-full w-full"
              scrollWheelZoom
              preferCanvas
            >
              <MapLayers
                data={data}
                center={center}
                radiusKm={radiusKm}
                layers={layers}
                ndviMode="before"
              />
            </MapContainer>
          </div>
          <div className="relative min-h-0">
            <span className="absolute left-3 top-3 z-[500] rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-700 shadow-sm">
              After
            </span>
            <MapContainer
              center={center}
              zoom={zoom}
              className="z-0 h-full w-full"
              scrollWheelZoom
              preferCanvas
            >
              <MapLayers
                data={data}
                center={center}
                radiusKm={radiusKm}
                layers={layers}
                ndviMode="after"
              />
            </MapContainer>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[600] -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-[11px] text-slate-600 shadow-sm">
          Drag split in sidebar · {Math.round(compareSplit)}% / {100 - Math.round(compareSplit)}%
        </div>
        {legend}
      </div>
    );
  }

  const ndviMode: "before" | "after" | "blend" =
    layers.ndvi_before && layers.ndvi_after ? "blend" : layers.ndvi_before ? "before" : "after";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <MapContainer center={center} zoom={zoom} className="z-0 h-full w-full" scrollWheelZoom preferCanvas>
        {data ? (
          <MapLayers
            data={data}
            center={center}
            radiusKm={radiusKm}
            layers={layers}
            ndviMode={ndviMode}
          />
        ) : (
          <>
            <TileLayer attribution="OSM" url={OSM_LIGHT} />
            <CircleMarker
              center={center}
              radius={Math.min(48, 12 + radiusKm)}
              pathOptions={{
                color: "#38bdf8",
                weight: 1.5,
                fillColor: "#86efac",
                fillOpacity: 0.06,
              }}
            />
            <Marker position={center}>
              <Popup>AOI · run analysis to load satellite layers</Popup>
            </Marker>
          </>
        )}
      </MapContainer>
      {legend}
    </div>
  );
}
