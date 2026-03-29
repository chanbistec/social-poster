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
        <StatCard title="Pending Approval" value={pending.count} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-300">
            Platform Health
          </h3>
          <p className="text-xs text-zinc-400">
            Token status will appear here once tenants are configured.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-300">
            Recent Posts
          </h3>
          <p className="text-xs text-zinc-400">
            No posts yet. Create your first post from the Posts page.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
