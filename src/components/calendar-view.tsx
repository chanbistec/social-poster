"use client";

import { useState } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import Link from "next/link";

interface Post {
  id: string;
  caption?: string;
  status: string;
  scheduled_at: string;
  platform?: string;
}

interface CalendarViewProps {
  posts: Post[];
  month: string; // "yyyy-MM"
  prevMonth: string;
  nextMonth: string;
  tenantId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500",
  pending: "bg-yellow-500",
  approved: "bg-green-500",
  scheduled: "bg-blue-500",
  published: "bg-emerald-500",
  failed: "bg-red-500",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] || "bg-zinc-600";
}

function buildMonthLink(month: string, tenantId?: string) {
  const params = new URLSearchParams();
  params.set("month", month);
  if (tenantId) params.set("tenant_id", tenantId);
  return `/calendar?${params.toString()}`;
}

export default function CalendarView({
  posts,
  month,
  prevMonth,
  nextMonth,
  tenantId,
}: CalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthDate = parseISO(`${month}-01`);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  // Build grid: start from Monday of the week containing monthStart
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Group posts by day (yyyy-MM-dd)
  const postsByDay: Record<string, Post[]> = {};
  for (const post of posts) {
    if (!post.scheduled_at) continue;
    const dayKey = format(parseISO(post.scheduled_at), "yyyy-MM-dd");
    if (!postsByDay[dayKey]) postsByDay[dayKey] = [];
    postsByDay[dayKey].push(post);
  }

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const selectedPosts = selectedDay ? postsByDay[selectedDay] || [] : [];

  return (
    <div className="space-y-4">
      {/* Header: prev/next + month label */}
      <div className="flex items-center justify-between">
        <Link
          href={buildMonthLink(prevMonth, tenantId)}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          ← Prev
        </Link>
        <h2 className="text-lg font-semibold text-zinc-100">
          {format(monthDate, "MMMM yyyy")}
        </h2>
        <Link
          href={buildMonthLink(nextMonth, tenantId)}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Next →
        </Link>
      </div>

      {/* Grid */}
      <div className="rounded-lg border border-white/10 bg-zinc-900 overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-white/10">
          {weekDays.map((d) => (
            <div
              key={d}
              className="px-1 py-2 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, monthDate);
            const today = isToday(day);
            const dayPosts = postsByDay[dayKey] || [];
            const isSelected = selectedDay === dayKey;

            return (
              <button
                key={dayKey}
                onClick={() =>
                  setSelectedDay(isSelected ? null : dayKey)
                }
                className={`
                  relative min-h-[4rem] sm:min-h-[5rem] p-1 sm:p-2
                  border-b border-r border-white/10
                  text-left transition-colors
                  ${inMonth ? "bg-zinc-950" : "bg-zinc-950/40"}
                  ${isSelected ? "bg-zinc-800/80" : "hover:bg-zinc-800/50"}
                  ${today ? "ring-1 ring-inset ring-orange-500" : ""}
                `}
              >
                <span
                  className={`
                    text-xs sm:text-sm font-medium
                    ${inMonth ? "text-zinc-200" : "text-zinc-600"}
                    ${today ? "text-orange-400 font-bold" : ""}
                  `}
                >
                  {format(day, "d")}
                </span>

                {/* Post dots */}
                {dayPosts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayPosts.slice(0, 5).map((p) => (
                      <span
                        key={p.id}
                        title={`${p.status}: ${p.caption?.split("\n")[0]?.slice(0, 40) || "Untitled"}`}
                        className={`inline-block h-2 w-2 rounded-full ${statusColor(p.status)}`}
                      />
                    ))}
                    {dayPosts.length > 5 && (
                      <span className="text-[10px] text-zinc-500">
                        +{dayPosts.length - 5}
                      </span>
                    )}
                  </div>
                )}

                {/* Post count badge on mobile */}
                {dayPosts.length > 0 && (
                  <span className="absolute top-1 right-1 sm:hidden text-[10px] text-zinc-400 bg-zinc-800 rounded px-1">
                    {dayPosts.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">
              {format(parseISO(selectedDay), "EEEE, MMMM d, yyyy")}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Close ✕
            </button>
          </div>

          {selectedPosts.length === 0 ? (
            <p className="text-xs text-zinc-500">No posts scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedPosts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-3 rounded-md border border-white/5 bg-zinc-950 px-3 py-2"
                >
                  <span
                    className={`mt-1 inline-block h-2.5 w-2.5 rounded-full shrink-0 ${statusColor(p.status)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-200 truncate">
                      {p.caption?.split("\n")[0] || "Untitled"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="capitalize">{p.status}</span>
                      {p.platform && <span>· {p.platform}</span>}
                      <span>
                        · {format(parseISO(p.scheduled_at), "HH:mm")}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/posts/${p.id}`}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 shrink-0"
                  >
                    View →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
