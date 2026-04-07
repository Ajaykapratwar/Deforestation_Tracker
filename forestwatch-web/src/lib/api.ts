import type { AnalyzeResponse } from "@/types/analysis";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

/** Structured 503 from FastAPI when Earth Engine is not available. */
export type EeConfigDetail = {
  code: string;
  message: string;
  project_id: string;
  enable_earth_engine_api: string;
  /** Cloud Console — register the GCP project for Earth Engine (required after API enable). */
  register_earth_engine_project?: string;
  earth_engine_access_docs?: string;
  google_cloud_console: string;
  earth_engine_code_editor: string;
};

export class ForestWatchApiError extends Error {
  constructor(public readonly eeConfig: EeConfigDetail) {
    super(eeConfig.message);
    this.name = "ForestWatchApiError";
  }
}

function throwFromResponseBody(body: unknown, fallback: string): never {
  const err = body as { detail?: unknown };
  const detail = err?.detail;
  if (detail && typeof detail === "object" && detail !== null && "message" in detail) {
    const o = detail as EeConfigDetail;
    if (o.code === "EARTH_ENGINE_CONFIG") {
      throw new ForestWatchApiError(o);
    }
    throw new Error(
      typeof (o as { message?: string }).message === "string"
        ? (o as { message: string }).message
        : fallback,
    );
  }
  if (typeof detail === "string") {
    throw new Error(detail);
  }
  throw new Error(fallback);
}

export async function analyzeRegion(body: {
  latitude: number;
  longitude: number;
  radius_km: number;
  start_date: string;
  end_date: string;
}): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throwFromResponseBody(json, "Analysis failed");
  }
  return res.json();
}

export async function fetchHotspotGeoJSON(body: {
  latitude: number;
  longitude: number;
  radius_km: number;
  start_date: string;
  end_date: string;
}): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${API_BASE}/export/geojson`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throwFromResponseBody(json, "GeoJSON export failed");
  }
  return res.json();
}

export { API_BASE };
