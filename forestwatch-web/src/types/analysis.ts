export type MapLayerSpec = { url: string; opacity: number };

export type AnalyzeResponse = {
  center: { lat: number; lon: number };
  radius_km: number;
  bounds: GeoJSON.Geometry;
  date_range: { start: string; end: string };
  before_period: { start: string; end: string };
  after_period: { start: string; end: string };
  satellite: "sentinel2" | "landsat89";
  scale_m: number;
  layers: {
    ndvi_before: MapLayerSpec;
    ndvi_after: MapLayerSpec;
    ndvi_change: MapLayerSpec;
    deforestation: MapLayerSpec;
  };
  analytics: {
    affected_area_km2: number;
    vegetation_loss_percent: number;
    hotspot_count: number;
    top_hotspots: number[][];
    mean_ndvi_change: number | null;
    mean_ndvi_after: number | null;
    deforestation_rate_km2_per_year: number;
    years_span: number;
  };
  trend: { year: number; mean_ndvi: number }[];
  insights: {
    summary: string;
    possible_causes: string[];
    suggested_actions: string[];
  };
  eco_score: number;
  warning: string | null;
  hotspots_geojson: GeoJSON.FeatureCollection | null;
  threshold_ndvi_change: number;
  exports: { png: Record<string, string> };
};
