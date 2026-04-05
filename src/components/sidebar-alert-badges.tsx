"use client";

import { useEffect, useState } from "react";

type AlertSummary = {
  pipeline: { stuck: number; failed: number };
  posts: { stuck: number; failed: number };
};

const EMPTY_SUMMARY: AlertSummary = {
  pipeline: { stuck: 0, failed: 0 },
  posts: { stuck: 0, failed: 0 },
};

export default function SidebarAlertBadges({
  section,
}: {
  section: keyof AlertSummary;
}) {
  const [summary, setSummary] = useState<AlertSummary>(EMPTY_SUMMARY);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/alerts/summary", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { data?: AlertSummary };
        if (!cancelled && data.data) {
          setSummary(data.data);
        }
      } catch {
        // Silent: badges are helpful, not critical.
      }
    }

    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const target = summary[section];
  if (!target.stuck && !target.failed) return null;

  return (
    <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5 pl-2 text-[10px]">
      {target.stuck > 0 ? (
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-300">
          {target.stuck} stuck
        </span>
      ) : null}
      {target.failed > 0 ? (
        <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-red-300">
          {target.failed} failed
        </span>
      ) : null}
    </span>
  );
}
