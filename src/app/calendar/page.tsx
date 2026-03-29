import db from "@/lib/db";
import CalendarView from "@/components/calendar-view";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant_id?: string }>;
}) {
  const { tenant_id } = await searchParams;

  const posts = tenant_id
    ? (db
        .prepare(
          "SELECT * FROM posts WHERE scheduled_at IS NOT NULL AND tenant_id = ? ORDER BY scheduled_at ASC"
        )
        .all(tenant_id) as any[])
    : (db
        .prepare(
          "SELECT * FROM posts WHERE scheduled_at IS NOT NULL ORDER BY scheduled_at ASC"
        )
        .all() as any[]);

  const tenants = db.prepare("SELECT id, name FROM tenants ORDER BY name").all() as any[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-zinc-400">Upcoming scheduled posts</p>
        </div>
        {tenants.length > 0 && (
          <form className="flex items-center gap-2">
            <select
              name="tenant_id"
              defaultValue={tenant_id || ""}
              className="rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="">All tenants</option>
              {tenants.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Filter
            </button>
          </form>
        )}
      </div>
      <CalendarView posts={posts} />
    </div>
  );
}
