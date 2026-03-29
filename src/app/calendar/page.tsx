import db from "@/lib/db";
import CalendarView from "@/components/calendar-view";
import {
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant_id?: string; month?: string }>;
}) {
  const { tenant_id, month } = await searchParams;

  // Determine the target month — default to current month
  const targetDate = month ? parseISO(`${month}-01`) : new Date();
  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);

  const monthStr = format(monthStart, "yyyy-MM");
  const startStr = format(monthStart, "yyyy-MM-dd");
  const endStr = format(monthEnd, "yyyy-MM-dd");

  const posts = tenant_id
    ? (db
        .prepare(
          `SELECT * FROM posts
           WHERE scheduled_at IS NOT NULL
             AND date(scheduled_at) >= date(?)
             AND date(scheduled_at) <= date(?)
             AND tenant_id = ?
           ORDER BY scheduled_at ASC`
        )
        .all(startStr, endStr, tenant_id) as any[])
    : (db
        .prepare(
          `SELECT * FROM posts
           WHERE scheduled_at IS NOT NULL
             AND date(scheduled_at) >= date(?)
             AND date(scheduled_at) <= date(?)
           ORDER BY scheduled_at ASC`
        )
        .all(startStr, endStr) as any[]);

  const tenants = db
    .prepare("SELECT id, name FROM tenants ORDER BY name")
    .all() as any[];

  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-zinc-400">Scheduled posts overview</p>
        </div>
        {tenants.length > 0 && (
          <form className="flex items-center gap-2">
            {month && <input type="hidden" name="month" value={month} />}
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
      <CalendarView
        posts={posts}
        month={monthStr}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        tenantId={tenant_id}
      />
    </div>
  );
}
