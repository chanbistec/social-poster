"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_INTERVAL_SECONDS = 30;

export default function PipelineHealthAutoRefresh({
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
}: {
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    setSecondsLeft(intervalSeconds);

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setIsRefreshing(true);
          router.refresh();
          return intervalSeconds;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [enabled, intervalSeconds, router]);

  useEffect(() => {
    if (!isRefreshing) return;
    const timeout = window.setTimeout(() => setIsRefreshing(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [isRefreshing]);

  const label = useMemo(() => {
    if (!enabled) return "Auto-refresh paused";
    if (isRefreshing) return "Refreshing now…";
    return `Refresh in ${secondsLeft}s`;
  }, [enabled, isRefreshing, secondsLeft]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-zinc-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-zinc-100">Live monitoring</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsRefreshing(true);
            setSecondsLeft(intervalSeconds);
            router.refresh();
          }}
          className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Refresh now
        </button>
        <button
          type="button"
          onClick={() => setEnabled((current) => !current)}
          className={`inline-flex min-h-[40px] items-center justify-center rounded-md px-3 py-2 text-sm ${enabled ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "border border-white/10 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"}`}
        >
          {enabled ? "Pause auto-refresh" : "Resume auto-refresh"}
        </button>
      </div>
    </div>
  );
}
