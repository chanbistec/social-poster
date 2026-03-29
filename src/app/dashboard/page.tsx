import Link from "next/link";
import db from "@/lib/db";

export default async function DashboardPage() {
  const tenants = db.prepare("SELECT COUNT(*) as count FROM tenants").get() as {
    count: number;
  };
  const posts = db.prepare("SELECT COUNT(*) as count FROM posts").get() as {
    count: number;
  };
  const pending = db
    .prepare(
      "SELECT COUNT(*) as count FROM posts WHERE status = 'pending_approval'"
    )
    .get() as { count: number };

  const recentPosts = db
    .prepare(
      "SELECT p.*, t.name as tenant_name FROM posts p LEFT JOIN tenants t ON p.tenant_id = t.id ORDER BY p.created_at DESC LIMIT 5"
    )
    .all() as any[];

  const platformStats = db
    .prepare(
      "SELECT pl.type, pl.token_expires_at, t.name as tenant_name FROM platforms pl JOIN tenants t ON pl.tenant_id = t.id ORDER BY pl.type"
    )
    .all() as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-zinc-400">
          Quick snapshot of tenants, posts and approvals
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Tenants" value={tenants.count} />
        <StatCard title="Total Posts" value={posts.count} />
        <StatCard
          title="Pending Approval"
          value={pending.count}
          highlight={pending.count > 0}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Platform Health */}
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-300">
            Platform Health
          </h3>
          {platformStats.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No platforms configured yet. Add tenants and connect platforms to
              see status here.
            </p>
          ) : (
            <div className="space-y-2">
              {platformStats.map((p: any, i: number) => {
                const status = getTokenStatus(p.token_expires_at);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-200 capitalize">
                        {p.type}
                      </span>
                      <span className="text-xs text-zinc-500">
                        ({p.tenant_name})
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        status === "valid"
                          ? "text-emerald-400"
                          : status === "expiring"
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {status === "valid"
                        ? "● Connected"
                        : status === "expiring"
                        ? "● Expiring Soon"
                        : "● Expired"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Posts */}
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Recent Posts</h3>
            <Link
              href="/posts"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              View all →
            </Link>
          </div>
          {recentPosts.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No posts yet. Create your first post from the Posts page.
            </p>
          ) : (
            <div className="space-y-2">
              {recentPosts.map((p: any) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.id}`}
                  className="block rounded-md bg-zinc-800/50 px-3 py-2 hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-200 truncate max-w-[200px]">
                      {p.caption
                        ? p.caption.length > 60
                          ? p.caption.slice(0, 60) + "…"
                          : p.caption
                        : "No caption"}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                    {p.tenant_name && <span>{p.tenant_name}</span>}
                    {p.created_at && (
                      <span>
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-400">{title}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          highlight ? "text-amber-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-zinc-700 text-zinc-300",
    pending_approval: "bg-amber-900/50 text-amber-400",
    approved: "bg-blue-900/50 text-blue-400",
    scheduled: "bg-purple-900/50 text-purple-400",
    published: "bg-emerald-900/50 text-emerald-400",
    failed: "bg-red-900/50 text-red-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        colors[status] || "bg-zinc-700 text-zinc-300"
      }`}
    >
      {status?.replace("_", " ")}
    </span>
  );
}

function getTokenStatus(expiry?: string | null) {
  if (!expiry) return "valid";
  const exp = new Date(expiry).getTime();
  const now = Date.now();
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  if (days < 0) return "expired";
  if (days < 7) return "expiring";
  return "valid";
}
