"use client";

import dynamic from "next/dynamic";

const ForestWatchDashboard = dynamic(
  () => import("@/components/forestwatch-dashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="text-sm font-medium">Loading ForestWatch AI…</span>
        </div>
      </div>
    ),
  },
);

export default function ForestWatchEntry() {
  return <ForestWatchDashboard />;
}
