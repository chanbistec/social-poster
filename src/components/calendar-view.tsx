import { format } from "date-fns";

export default function CalendarView({ posts }: { posts: any[] }) {
  // Simple list view for now (upgrade to grid later)
  return (
    <div className="space-y-2">
      {posts.map((p) => (
        <div
          key={p.id}
          className="rounded-md border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300"
        >
          <div className="flex items-center justify-between">
            <span>{p.caption?.split("\n")[0] || "Untitled"}</span>
            <span className="text-zinc-400">
              {p.scheduled_at ? format(new Date(p.scheduled_at), "MMM d, HH:mm") : "—"}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500">{p.status}</div>
        </div>
      ))}
      {posts.length === 0 && (
        <div className="text-xs text-zinc-500">No scheduled posts</div>
      )}
    </div>
  );
}
