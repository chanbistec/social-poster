import Link from "next/link";
import db from "@/lib/db";
import PostCard from "@/components/post-card";

const STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "failed",
];

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant_id?: string; status?: string }>;
}) {
  const params = await searchParams;
  const tenantFilter = params.tenant_id || "";
  const statusFilter = params.status || "";

  // Build dynamic query
  const conditions: string[] = [];
  const values: any[] = [];

  if (tenantFilter) {
    conditions.push("p.tenant_id = ?");
    values.push(tenantFilter);
  }
  if (statusFilter) {
    conditions.push("p.status = ?");
    values.push(statusFilter);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const posts = db
    .prepare(
      `SELECT p.*, t.name as tenant_name
       FROM posts p
       LEFT JOIN tenants t ON p.tenant_id = t.id
       ${where}
       ORDER BY p.created_at DESC`
    )
    .all(...values) as any[];

  // Get all tenants for filter dropdown
  const tenants = db
    .prepare("SELECT id, name FROM tenants ORDER BY name")
    .all() as { id: string; name: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-sm text-zinc-400">
            Drafts, approvals, schedules, published content
          </p>
        </div>
        <Link
          href="/posts/new"
          className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-400 min-h-[44px] w-full sm:w-auto"
        >
          + New Post
        </Link>
      </div>

      {/* Filter bar */}
      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Tenant</label>
          <select
            name="tenant_id"
            defaultValue={tenantFilter}
            className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white min-h-[44px] sm:w-auto sm:min-w-[160px] sm:min-h-0 sm:py-2"
          >
            <option value="">All tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Status</label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white min-h-[44px] sm:w-auto sm:min-w-[160px] sm:min-h-0 sm:py-2"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-zinc-800 px-4 py-2.5 text-sm text-white hover:bg-zinc-700 border border-white/10 min-h-[44px] w-full sm:w-auto"
        >
          Filter
        </button>

        {(tenantFilter || statusFilter) && (
          <Link
            href="/posts"
            className="text-xs text-zinc-500 hover:text-zinc-300 py-2"
          >
            Clear filters
          </Link>
        )}
      </form>

      {/* Post list */}
      <div className="grid gap-4">
        {posts.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6 text-sm text-zinc-400">
            No posts found.
          </div>
        )}
        {posts.map((p: any) => (
          <PostCard key={p.id} post={p} tenantName={p.tenant_name} />
        ))}
      </div>
    </div>
  );
}
