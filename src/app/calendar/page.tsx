import db from "@/lib/db";
import CalendarView from "@/components/calendar-view";

export default async function CalendarPage() {
  const posts = db
    .prepare("SELECT * FROM posts WHERE scheduled_at IS NOT NULL ORDER BY scheduled_at ASC")
    .all() as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-zinc-400">Upcoming scheduled posts</p>
      </div>
      <CalendarView posts={posts} />
    </div>
  );
}
