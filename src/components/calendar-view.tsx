"use client";

import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import Link from "next/link";
import { toast } from "sonner";

interface Post {
  id: number;
  caption?: string | null;
  status: string;
  scheduled_at: string | null;
  platform?: string;
}

interface CalendarViewProps {
  posts: Post[];
  month: string;
  prevMonth: string;
  nextMonth: string;
  tenantId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500",
  pending: "bg-yellow-500",
  approved: "bg-orange-500",
  scheduled: "bg-sky-500",
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

function isFutureDay(dayKey: string): boolean {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  return dayKey > todayKey;
}

function titleForPost(post: Post): string {
  return post.caption?.split("\n")[0]?.trim() || "Untitled";
}

export default function CalendarView({
  posts,
  month,
  prevMonth,
  nextMonth,
  tenantId,
}: CalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarPosts, setCalendarPosts] = useState(posts);
  const [draggedPostId, setDraggedPostId] = useState<number | null>(null);
  const [dropTargetDay, setDropTargetDay] = useState<string | null>(null);
  const [movePostId, setMovePostId] = useState<number | null>(null);
  const [pendingPostId, setPendingPostId] = useState<number | null>(null);

  useEffect(() => {
    setCalendarPosts(posts);
  }, [posts]);

  const monthDate = parseISO(`${month}-01`);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const { postsByDay, approvedPosts } = useMemo(() => {
    const grouped: Record<string, Post[]> = {};
    const approved: Post[] = [];

    for (const post of calendarPosts) {
      if (post.status === "approved" && !post.scheduled_at) {
        approved.push(post);
        continue;
      }

      if (!post.scheduled_at) continue;
      const dayKey = format(parseISO(post.scheduled_at), "yyyy-MM-dd");
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(post);
    }

    for (const dayKey of Object.keys(grouped)) {
      grouped[dayKey].sort((a, b) => {
        const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return aTime - bTime;
      });
    }

    approved.sort((a, b) => a.id - b.id);
    return { postsByDay: grouped, approvedPosts: approved };
  }, [calendarPosts]);

  const selectedPosts = selectedDay ? postsByDay[selectedDay] || [] : [];
  const movePost = movePostId ? calendarPosts.find((post) => post.id === movePostId) ?? null : null;
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  async function movePostToDay(postId: number, dayKey: string) {
    if (!isFutureDay(dayKey)) {
      toast.error("Posts can only be moved to a future day.");
      return;
    }

    setPendingPostId(postId);
    setDropTargetDay(dayKey);

    try {
      const response = await fetch(`/api/posts/${postId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_date: dayKey }),
      });

      const payload = (await response.json()) as { data?: Post; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Failed to reschedule post.");
      }

      setCalendarPosts((current) =>
        current.map((post) => (post.id === postId ? payload.data! : post)),
      );
      setSelectedDay(dayKey);
      setMovePostId(null);
      toast.success(`Moved to ${format(parseISO(dayKey), "MMM d")}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reschedule post.");
    } finally {
      setPendingPostId(null);
      setDropTargetDay(null);
      setDraggedPostId(null);
    }
  }

  function renderPostCard(post: Post, options?: { compact?: boolean; showMoveHint?: boolean }) {
    const compact = options?.compact ?? false;
    const activeMove = movePostId === post.id;
    const busy = pendingPostId === post.id;

    return (
      <div
        key={post.id}
        draggable={!busy}
        onDragStart={() => {
          setDraggedPostId(post.id);
          setMovePostId(null);
        }}
        onDragEnd={() => {
          setDraggedPostId(null);
          setDropTargetDay(null);
        }}
        className={[
          "rounded-xl border border-white/10 bg-zinc-950/90 text-left transition",
          compact ? "px-3 py-2" : "px-3 py-3",
          busy ? "opacity-60" : "hover:border-orange-400/40 hover:bg-zinc-900",
          activeMove ? "border-orange-500/80 ring-1 ring-orange-500/60" : "",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusColor(post.status)}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-100">{titleForPost(post)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
              <span className="capitalize">{post.status}</span>
              {post.platform && <span>· {post.platform}</span>}
              {post.scheduled_at ? <span>· {format(parseISO(post.scheduled_at), "HH:mm")}</span> : <span>· time set on drop</span>}
            </div>
          </div>
          <Link
            href={`/posts/${post.id}`}
            className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-200"
          >
            View →
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMovePostId((current) => (current === post.id ? null : post.id))}
            disabled={busy}
            className={[
              "rounded-full border px-2.5 py-1 text-[10px] font-medium transition",
              activeMove
                ? "border-orange-500 bg-orange-500/15 text-orange-300"
                : "border-white/10 bg-zinc-900 text-zinc-300 hover:border-orange-500/40 hover:text-orange-200",
            ].join(" ")}
          >
            {activeMove ? "Cancel move" : post.status === "approved" ? "Schedule" : "Move"}
          </button>
          {options?.showMoveHint && !busy && (
            <span className="text-[10px] text-zinc-500">Drag to a future day or tap Move.</span>
          )}
          {busy && <span className="text-[10px] text-orange-300">Saving…</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={buildMonthLink(prevMonth, tenantId)}
          className="rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-center text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          ← Prev
        </Link>
        <h2 className="text-center text-lg font-semibold text-zinc-100">{format(monthDate, "MMMM yyyy")}</h2>
        <Link
          href={buildMonthLink(nextMonth, tenantId)}
          className="rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-center text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Next →
        </Link>
      </div>

      {approvedPosts.length > 0 && (
        <div className="rounded-2xl border border-orange-500/20 bg-zinc-900/90 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Ready to schedule</h3>
              <p className="text-xs text-zinc-400">Approved posts can be dragged or moved onto a future calendar day.</p>
            </div>
            <span className="self-start rounded-full bg-orange-500/10 px-2 py-1 text-[10px] font-medium text-orange-300">
              {approvedPosts.length} awaiting dates
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {approvedPosts.map((post) => renderPostCard(post, { compact: true, showMoveHint: true }))}
          </div>
        </div>
      )}

      {movePost && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
          <span className="font-medium">Move mode:</span> {titleForPost(movePost)}. Tap or drop onto a future day to keep its time when possible.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
        <div className="grid grid-cols-7 border-b border-white/10">
          {weekDays.map((d) => (
            <div key={d} className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, monthDate);
            const today = isToday(day);
            const dayPosts = postsByDay[dayKey] || [];
            const isSelected = selectedDay === dayKey;
            const isValidTarget = isFutureDay(dayKey);
            const isDropActive = dropTargetDay === dayKey && (draggedPostId !== null || movePostId !== null);

            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => {
                  if (movePostId && isValidTarget) {
                    void movePostToDay(movePostId, dayKey);
                    return;
                  }
                  setSelectedDay(isSelected ? null : dayKey);
                }}
                onDragOver={(event) => {
                  if (!draggedPostId || !isValidTarget) return;
                  event.preventDefault();
                  setDropTargetDay(dayKey);
                }}
                onDragLeave={() => {
                  if (dropTargetDay === dayKey) setDropTargetDay(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggedPostId || !isValidTarget) return;
                  void movePostToDay(draggedPostId, dayKey);
                }}
                className={[
                  "relative min-h-[5.5rem] border-b border-r border-white/10 p-1.5 text-left transition sm:min-h-[7rem] sm:p-2",
                  inMonth ? "bg-zinc-950" : "bg-zinc-950/40",
                  isSelected ? "bg-zinc-800/80" : "hover:bg-zinc-900",
                  today ? "ring-1 ring-inset ring-orange-500/70" : "",
                  isValidTarget && (draggedPostId !== null || movePostId !== null) ? "cursor-copy" : "",
                  isDropActive ? "bg-orange-500/15 ring-2 ring-inset ring-orange-400" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={[
                    "text-xs font-medium sm:text-sm",
                    inMonth ? "text-zinc-200" : "text-zinc-600",
                    today ? "font-bold text-orange-400" : "",
                  ].join(" ")}>
                    {format(day, "d")}
                  </span>
                  {dayPosts.length > 0 && (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:hidden">
                      {dayPosts.length}
                    </span>
                  )}
                </div>

                {dayPosts.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {dayPosts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        draggable={pendingPostId !== post.id}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDraggedPostId(post.id);
                          setMovePostId(null);
                        }}
                        onDragEnd={() => {
                          setDraggedPostId(null);
                          setDropTargetDay(null);
                        }}
                        className={[
                          "rounded-md border px-1.5 py-1 text-[10px] leading-tight",
                          pendingPostId === post.id
                            ? "border-white/10 bg-zinc-900/50 text-zinc-500"
                            : "border-white/10 bg-zinc-900/90 text-zinc-200",
                        ].join(" ")}
                        title={titleForPost(post)}
                      >
                        <div className="flex items-center gap-1">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor(post.status)}`} />
                          <span className="truncate">{titleForPost(post)}</span>
                        </div>
                      </div>
                    ))}
                    {dayPosts.length > 3 && <span className="block text-[10px] text-zinc-500">+{dayPosts.length - 3} more</span>}
                  </div>
                )}

                {isValidTarget && (draggedPostId !== null || movePostId !== null) && (
                  <span className="absolute bottom-1 right-1 text-[9px] uppercase tracking-wide text-orange-300/80">
                    {isDropActive ? "Drop here" : "Future"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>

      {selectedDay && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-zinc-900/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">{format(parseISO(selectedDay), "EEEE, MMMM d, yyyy")}</h3>
              <p className="text-xs text-zinc-500">
                {isFutureDay(selectedDay)
                  ? "Drag posts here, or tap Move on a card and then tap this day."
                  : "Select a future date to reschedule posts."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Close ✕
            </button>
          </div>

          {selectedPosts.length === 0 ? (
            <p className="text-xs text-zinc-500">No posts scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedPosts.map((post) => renderPostCard(post, { showMoveHint: true }))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
