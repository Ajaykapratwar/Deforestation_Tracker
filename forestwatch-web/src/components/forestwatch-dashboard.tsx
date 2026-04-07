"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  subMonths,
  subYears,
  format,
  differenceInCalendarDays,
} from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { jsPDF } from "jspdf";
import {
  Loader2,
  MapPin,
  Satellite,
  Download,
  FileJson,
  Bell,
  BookmarkPlus,
  Leaf,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import ForestMap, { type LayerKey } from "@/components/forest-map";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  analyzeRegion,
  API_BASE,
  fetchHotspotGeoJSON,
  ForestWatchApiError,
  type EeConfigDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AnalyzeResponse } from "@/types/analysis";

const PANEL = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

const PRESETS = ["10Y", "5Y", "3Y", "2Y", "1Y", "6M", "3M"] as const;

const FORESTS = [
  { name: "Amazon (Manaus)", lat: -3.119, lon: -60.0217 },
  { name: "Sundarbans", lat: 21.9497, lon: 88.8934 },
  { name: "Congo Basin", lat: -0.7893, lon: 21.5589 },
  { name: "Borneo (Central)", lat: -0.956, lon: 113.9 },
];

type SavedRegion = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius: number;
  start: string;
  end: string;
};

const STORAGE_SAVED = "forestwatch_saved_regions";
const STORAGE_ALERT = "forestwatch_alert_threshold";

function applyPreset(key: (typeof PRESETS)[number], end: Date) {
  switch (key) {
    case "10Y":
      return { start: subYears(end, 10), end };
    case "5Y":
      return { start: subYears(end, 5), end };
    case "3Y":
      return { start: subYears(end, 3), end };
    case "2Y":
      return { start: subYears(end, 2), end };
    case "1Y":
      return { start: subYears(end, 1), end };
    case "6M":
      return { start: subMonths(end, 6), end };
    case "3M":
      return { start: subMonths(end, 3), end };
    default:
      return { start: subYears(end, 5), end };
  }
}

function durationLabel(start: string, end: string) {
  const d = differenceInCalendarDays(new Date(end), new Date(start));
  if (d >= 300) return `~${(d / 365.25).toFixed(1)} years`;
  if (d >= 30) return `${Math.round(d / 30)} months`;
  return `${d} days`;
}

export default function ForestWatchDashboard() {
  const [lat, setLat] = useState(19.076);
  const [lon, setLon] = useState(72.8777);
  const [radius, setRadius] = useState(20);
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(format(subYears(today, 5), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(today, "yyyy-MM-dd"));
  const [activePreset, setActivePreset] = useState<(typeof PRESETS)[number] | null>("5Y");

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    ndvi_before: true,
    ndvi_after: true,
    ndvi_change: false,
    deforestation: true,
  });
  const [compareMode, setCompareMode] = useState(true);
  const [compareSplit, setCompareSplit] = useState(50);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [eeHelp, setEeHelp] = useState<EeConfigDetail | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [alertFlash, setAlertFlash] = useState(false);
  const [saved, setSaved] = useState<SavedRegion[]>([]);
  const [alertThreshold, setAlertThreshold] = useState(12);

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_SAVED);
      if (s) setSaved(JSON.parse(s) as SavedRegion[]);
      const a = localStorage.getItem(STORAGE_ALERT);
      if (a) setAlertThreshold(Number(a) || 12);
    } catch {
      /* ignore */
    }
  }, []);

  const persistSaved = useCallback((list: SavedRegion[]) => {
    setSaved(list);
    localStorage.setItem(STORAGE_SAVED, JSON.stringify(list));
  }, []);

  const onPreset = (p: (typeof PRESETS)[number]) => {
    const e = new Date(endDate);
    const { start } = applyPreset(p, e);
    setStartDate(format(start, "yyyy-MM-dd"));
    setActivePreset(p);
  };

  const run = async () => {
    setError(null);
    setEeHelp(null);
    setLoading(true);
    setLoadingStep("Fetching satellite data…");
    try {
      await new Promise((r) => setTimeout(r, 400));
      setLoadingStep("Processing NDVI & change detection…");
      const res = await analyzeRegion({
        latitude: lat,
        longitude: lon,
        radius_km: radius,
        start_date: startDate,
        end_date: endDate,
      });
      setData(res);
      if (res.analytics.vegetation_loss_percent >= alertThreshold) {
        setAlertFlash(true);
        setTimeout(() => setAlertFlash(false), 8000);
      }
    } catch (e) {
      if (e instanceof ForestWatchApiError) {
        setError(e.message);
        setEeHelp(e.eeConfig);
      } else {
        setError(e instanceof Error ? e.message : "Request failed");
        setEeHelp(null);
      }
      setData(null);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const yoy = useMemo(() => {
    if (!data?.trend?.length) return [];
    const t = [...data.trend].sort((a, b) => a.year - b.year);
    return t.map((row, i) => {
      const prev = i > 0 ? t[i - 1].mean_ndvi : row.mean_ndvi;
      return {
        year: row.year,
        mean_ndvi: row.mean_ndvi,
        yoy_change: row.mean_ndvi - prev,
      };
    });
  }, [data]);

  const downloadPng = (key: string, label: string) => {
    const url = data?.exports?.png?.[key];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `forestwatch-${label}.png`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  };

  const downloadGeoJSON = async () => {
    try {
      const gj = await fetchHotspotGeoJSON({
        latitude: lat,
        longitude: lon,
        radius_km: radius,
        start_date: startDate,
        end_date: endDate,
      });
      const blob = new Blob([JSON.stringify(gj, null, 2)], { type: "application/geo+json" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "forestwatch-hotspots.geojson";
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      setError("GeoJSON export failed");
    }
  };

  const downloadPdf = () => {
    if (!data) return;
    const doc = new jsPDF();
    let y = 16;
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("ForestWatch AI — Monitoring Report", 14, y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, 14, y);
    y += 6;
    doc.text(`Location: ${lat.toFixed(4)}, ${lon.toFixed(4)} · Radius ${radius} km`, 14, y);
    y += 6;
    doc.text(`Period: ${startDate} → ${endDate} (${durationLabel(startDate, endDate)})`, 14, y);
    y += 6;
    doc.text(`Satellite: ${data.satellite} · Scale ${data.scale_m}m`, 14, y);
    y += 10;
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Analytics", 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const lines = [
      `Affected area (approx.): ${data.analytics.affected_area_km2} km²`,
      `Vegetation loss (vs NDVI>0.2 baseline): ${data.analytics.vegetation_loss_percent}%`,
      `Hotspots sampled: ${data.analytics.hotspot_count}`,
      `Mean NDVI change: ${data.analytics.mean_ndvi_change ?? "n/a"}`,
      `Deforestation rate: ${data.analytics.deforestation_rate_km2_per_year} km²/yr`,
      `Eco score: ${data.eco_score}/100`,
    ];
    lines.forEach((line) => {
      doc.text(line, 14, y);
      y += 5;
    });
    y += 4;
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Summary", 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const split = doc.splitTextToSize(data.insights.summary, 180);
    doc.text(split, 14, y);
    y += split.length * 4 + 6;
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Suggested actions", 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    data.insights.suggested_actions.forEach((a) => {
      const t = doc.splitTextToSize(`• ${a}`, 180);
      doc.text(t, 14, y);
      y += t.length * 4 + 2;
    });
    doc.save("forestwatch-report.pdf");
  };

  const saveRegion = () => {
    const name = window.prompt("Region name", `AOI ${format(new Date(), "yyyy-MM-dd")}`);
    if (!name) return;
    const item: SavedRegion = {
      id: crypto.randomUUID(),
      name,
      lat,
      lon,
      radius,
      start: startDate,
      end: endDate,
    };
    persistSaved([item, ...saved]);
  };

  const loadRegion = (r: SavedRegion) => {
    setLat(r.lat);
    setLon(r.lon);
    setRadius(r.radius);
    setStartDate(r.start);
    setEndDate(r.end);
    setActivePreset(null);
  };

  const setLayer = (k: LayerKey, on: boolean) => setLayers((p) => ({ ...p, [k]: on }));

  const zoom = data ? 10 : 8;
  const showConfigHint =
    !!eeHelp ||
    (!!error &&
      (error.toLowerCase().includes("earth engine") || error.includes("GEE_PROJECT")));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-lg shadow-emerald-900/20">
            <Leaf className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">ForestWatch AI</h1>
            <p className="text-xs text-slate-500">Satellite NDVI intelligence for conservation</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
          <Satellite className="h-4 w-4" />
          <span>Landsat 8/9 · Sentinel-2 · Earth Engine</span>
        </div>
      </header>

      {alertFlash && (
        <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-800">
          <Bell className="h-4 w-4 shrink-0" />
          High vegetation loss vs threshold ({alertThreshold}%). Review deforestation layer and hotspots.
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-0 lg:p-4">
        {/* Left sidebar */}
        <aside className="flex w-full flex-col gap-3 lg:w-[320px] lg:shrink-0 lg:pr-3">
          <div className={PANEL}>
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-slate-700">Study area</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="lat">Latitude</Label>
                <input
                  id="lat"
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <Label htmlFor="lon">Longitude</Label>
                <input
                  id="lon"
                  type="number"
                  step="0.0001"
                  value={lon}
                  onChange={(e) => setLon(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between">
                <Label>Radius · {radius} km</Label>
              </div>
              <Slider
                className="mt-2"
                value={[radius]}
                onValueChange={(v) => setRadius(v[0])}
                min={5}
                max={50}
                step={1}
              />
            </div>
            <div className="mt-3">
              <Label>Quick forests</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FORESTS.map((f) => (
                  <Button
                    key={f.name}
                    type="button"
                    variant="preset"
                    size="sm"
                    onClick={() => {
                      setLat(f.lat);
                      setLon(f.lon);
                    }}
                  >
                    {f.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className={PANEL}>
            <div className="mb-2 text-sm font-medium text-slate-700">Time comparison</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="preset"
                  size="sm"
                  className={activePreset === p ? "border-emerald-500 bg-emerald-50 text-emerald-700" : ""}
                  onClick={() => onPreset(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="start">Start</Label>
                <input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActivePreset(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
                />
              </div>
              <div>
                <Label htmlFor="end">End</Label>
                <input
                  id="end"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActivePreset(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
                />
              </div>
            </div>
            {differenceInCalendarDays(new Date(endDate), new Date(startDate)) <= 200 && (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Short-term analysis may be affected by seasonal vegetation changes.
              </p>
            )}
          </div>

          <div className={PANEL}>
            <div className="mb-2 text-sm font-medium text-slate-700">Map layers</div>
            {(
              [
                ["ndvi_before", "Greenery (Before)"],
                ["ndvi_after", "Greenery (After)"],
                ["ndvi_change", "NDVI difference"],
                ["deforestation", "Deforestation Alert (Red)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-600">{label}</span>
                <Switch checked={layers[k]} onCheckedChange={(on) => setLayer(k, on)} />
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-600">Before / after split view</span>
              <Switch checked={compareMode} onCheckedChange={setCompareMode} />
            </div>
            {compareMode && layers.ndvi_before && layers.ndvi_after && (
              <div className="mt-3">
                <Label>Split ratio</Label>
                <Slider
                  className="mt-2"
                  value={[compareSplit]}
                  onValueChange={(v) => setCompareSplit(v[0])}
                  min={25}
                  max={75}
                  step={1}
                />
              </div>
            )}
          </div>

          <div className={PANEL}>
            <div className="mb-2 text-sm font-medium text-slate-700">Smart alerts</div>
            <div className="flex items-center gap-2">
              <Label className="normal-case">Loss alert ≥ %</Label>
              <input
                type="number"
                value={alertThreshold}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setAlertThreshold(n);
                  localStorage.setItem(STORAGE_ALERT, String(n));
                }}
                className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
              />
            </div>
            <Button type="button" variant="secondary" className="mt-3 w-full" onClick={saveRegion}>
              <BookmarkPlus className="h-4 w-4" />
              Save region
            </Button>
            {saved.length > 0 && (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs">
                {saved.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => loadRegion(r)}
                    className="block w-full truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-slate-700 hover:bg-slate-100"
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={run}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Satellite className="h-4 w-4" />}
            Run analysis
          </Button>
          {loading && (
            <p className="text-center text-xs text-emerald-600 animate-pulse">{loadingStep}</p>
          )}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700">
              <p className="font-medium">{error}</p>
              {eeHelp ? (
                <ul className="mt-2 space-y-1.5 border-t border-red-200 pt-2 text-[11px] text-slate-600">
                  {eeHelp.project_id ? (
                    <li>
                      <span className="text-slate-500">Project:</span>{" "}
                      <code className="rounded bg-slate-100 px-1 text-emerald-700">{eeHelp.project_id}</code>
                    </li>
                  ) : null}
                  {eeHelp.register_earth_engine_project ? (
                    <li>
                      <a
                        href={eeHelp.register_earth_engine_project}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-amber-700 underline hover:text-amber-600"
                      >
                        Register this project for Earth Engine (required — Google Cloud)
                      </a>
                    </li>
                  ) : null}
                  <li>
                    <a
                      href={eeHelp.enable_earth_engine_api}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-500"
                    >
                      Enable Earth Engine API
                    </a>
                  </li>
                  {eeHelp.earth_engine_access_docs ? (
                    <li>
                      <a
                        href={eeHelp.earth_engine_access_docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-500"
                      >
                        Earth Engine access and eligibility (Google documentation)
                      </a>
                    </li>
                  ) : null}
                  <li>
                    <a
                      href={eeHelp.google_cloud_console}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-500"
                    >
                      Cloud Console (this project)
                    </a>
                  </li>
                  <li>
                    <a
                      href={eeHelp.earth_engine_code_editor}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-500"
                    >
                      Earth Engine Code Editor
                    </a>
                  </li>
                </ul>
              ) : null}
              {showConfigHint && !eeHelp ? (
                <span className="mt-1 block text-slate-600">
                  API: {API_BASE} — set <code className="rounded bg-slate-100 px-1 text-emerald-700">GEE_PROJECT_ID</code> in{" "}
                  <code className="rounded bg-slate-100 px-1 text-emerald-700">backend/.env</code>, enable the Earth Engine API on
                  that project, then restart Uvicorn.
                </span>
              ) : null}
            </div>
          )}
        </aside>

        {/* Map center */}
        <main className="relative min-h-[420px] flex-1 lg:min-h-0">
          <ForestMap
            data={data}
            center={[lat, lon]}
            radiusKm={radius}
            zoom={zoom}
            layers={layers}
            compareSplit={compareSplit}
            compareMode={compareMode}
          />
        </main>

        {/* Right analytics */}
        <aside className="flex w-full flex-col gap-3 lg:w-[340px] lg:shrink-0 lg:pl-3">
          {data ? (
            <>
              <div className={PANEL}>
                <p className="text-xs uppercase tracking-widest text-slate-500">Duration</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  Change window · {durationLabel(startDate, endDate)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Before {data.before_period.start} → {data.before_period.end} · After{" "}
                  {data.after_period.start} → {data.after_period.end}
                </p>
                <p className="mt-2 text-xs text-emerald-700">
                  Dataset: {data.satellite === "sentinel2" ? "Sentinel-2 SR" : "Landsat 8/9 L2"} · NDVI Δ
                  threshold {data.threshold_ndvi_change}
                </p>
              </div>

              <div className={PANEL}>
                <p className="text-xs uppercase tracking-widest text-slate-500">Deforestation panel</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
                    <p className="text-[10px] uppercase text-red-600">Affected</p>
                    <p className="text-xl font-bold text-slate-900">{data.analytics.affected_area_km2}</p>
                    <p className="text-[10px] text-slate-500">km² (masked loss)</p>
                  </div>
                  <div className="rounded-xl bg-orange-50 p-3 ring-1 ring-orange-200">
                    <p className="text-[10px] uppercase text-orange-600">Loss %</p>
                    <p className="text-xl font-bold text-slate-900">
                      {data.analytics.vegetation_loss_percent}%
                    </p>
                    <p className="text-[10px] text-slate-500">vs NDVI&gt;0.2</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-[10px] uppercase text-slate-500">Hotspots</p>
                    <p className="text-xl font-bold text-slate-900">{data.analytics.hotspot_count}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                    <p className="text-[10px] uppercase text-emerald-600">Eco score</p>
                    <p className="text-xl font-bold text-slate-900">{data.eco_score}</p>
                    <p className="text-[10px] text-slate-500">/ 100</p>
                  </div>
                </div>
                {data.analytics.top_hotspots.length > 0 && (
                  <div className="mt-3 text-[11px] text-slate-500">
                    <p className="font-medium text-slate-600">Sample hotspot coords (lat, lon)</p>
                    <ul className="mt-1 max-h-20 list-inside list-disc overflow-y-auto">
                      {data.analytics.top_hotspots.slice(0, 6).map((c, i) => (
                        <li key={i}>
                          {c[0].toFixed(3)}, {c[1].toFixed(3)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className={PANEL}>
                <p className="mb-2 text-xs uppercase tracking-widest text-slate-500">NDVI trend</p>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                        labelStyle={{ color: "#475569" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="mean_ndvi"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {yoy.length > 1 && (
                <div className={PANEL}>
                  <p className="mb-2 text-xs uppercase tracking-widest text-slate-500">
                    Year-on-year Δ NDVI
                  </p>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yoy.slice(1)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="year" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                        />
                        <Bar dataKey="yoy_change" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Rate: {data.analytics.deforestation_rate_km2_per_year} km² loss / yr (masked)
                  </p>
                </div>
              )}

              <div className={PANEL}>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-slate-700">AI insights</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">{data.insights.summary}</p>
                <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Possible causes</p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                  {data.insights.possible_causes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Actions</p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                  {data.insights.suggested_actions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className={PANEL}>
                <p className="mb-2 text-xs uppercase tracking-widest text-slate-500">Export</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadPng("ndvi_before", "ndvi-before")}>
                    <Download className="h-3.5 w-3.5" />
                    NDVI before
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadPng("ndvi_after", "ndvi-after")}>
                    <Download className="h-3.5 w-3.5" />
                    NDVI after
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadPng("deforestation", "deforestation")}>
                    <Download className="h-3.5 w-3.5" />
                    Loss map
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={downloadGeoJSON}>
                    <FileJson className="h-3.5 w-3.5" />
                    GeoJSON
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={downloadPdf}>
                    <Download className="h-3.5 w-3.5" />
                    PDF report
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className={cn(PANEL, "flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center")}>
              <Satellite className="h-10 w-10 text-slate-400" />
              <p className="text-sm text-slate-500">Run an analysis to load analytics, charts, and exports.</p>
            </div>
          )}
        </aside>
      </div>

      {data?.warning && (
        <div className="border-t border-amber-300 bg-amber-50 px-6 py-2 text-center text-xs text-amber-700">
          {data.warning}
        </div>
      )}
    </div>
  );
}
