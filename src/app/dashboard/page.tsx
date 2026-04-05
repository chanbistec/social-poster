import Link from "next/link";
export const dynamic = 'force-dynamic';
import db from "@/lib/db";
import { ApproveButton, RejectButton } from "./approval-actions";

type CountRow = { count: number };
type NamedCountRow = { status: string; count: number };
type PendingPostRow = {
  id: number;
  caption: string | null;
  platforms: string;
  created_at: string;
  tenant_name: string | null;
};
type PostRow = {
  id: number;
  caption: string | null;
  status: string;
  created_at: string;
  updated_at?: string;
  scheduled_at?: string | null;
  tenant_name: string | null;
};
type PlatformHealthRow = {
  type: string;
  token_expires_at: string | null;
  tenant_name: string;
};
type PartialPublishRow = {
  id: number;
  caption: string | null;
  tenant_name: string | null;
  scheduled_at: string | null;
  updated_at: string;
  success_count: number;
  failed_count: number;
  failed_platforms: string;
};
type PublishFailureRow = {
  id: number;
  platform: string;
  error: string | null;
  created_at: string;
  caption: string | null;
  tenant_name: string | null;
  post_id: number;
};
type PipelineRunRow = {
  id: number;
  status: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  template_name: string | null;
  tenant_name: string | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant_id?: string }>;
}) {
  const params = await searchParams;
  const tenantFilter = params.tenant_id || null;
  const postTenantClause = tenantFilter ? "WHERE p.tenant_id = ?" : "";
  const postTenantArgs = tenantFilter ? [tenantFilter] : [];
  const pipelineTenantClause = tenantFilter ? "WHERE pt.tenant_id = ?" : "";
  const pipelineTenantArgs = tenantFilter ? [tenantFilter] : [];

  const tenants = db.prepare("SELECT COUNT(*) as count FROM tenants").get() as CountRow;

  const allTenants = db
    .prepare("SELECT id, name FROM tenants ORDER BY name")
    .all() as { id: string; name: string }[];

  const posts = tenantFilter
    ? (db.prepare("SELECT COUNT(*) as count FROM posts WHERE tenant_id = ?").get(tenantFilter) as CountRow)
    : (db.prepare("SELECT COUNT(*) as count FROM posts").get() as CountRow);

  const pending = tenantFilter
    ? (db
        .prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'pending_approval' AND tenant_id = ?")
        .get(tenantFilter) as CountRow)
    : (db
        .prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'pending_approval'")
        .get() as CountRow);

  const pendingPosts = tenantFilter
    ? (db
        .prepare(
          "SELECT p.*, t.name as tenant_name FROM posts p LEFT JOIN tenants t ON p.tenant_id = t.id WHERE p.status = 'pending_approval' AND p.tenant_id = ? ORDER BY p.created_at ASC"
        )
        .all(tenantFilter) as PendingPostRow[])
    : (db
        .prepare(
          "SELECT p.*, t.name as tenant_name FROM posts p LEFT JOIN tenants t ON p.tenant_id = t.id WHERE p.status = 'pending_approval' ORDER BY p.created_at ASC"
        )
        .all() as PendingPostRow[]);

  const recentPosts = tenantFilter
    ? (db
        .prepare(
          "SELECT p.*, t.name as tenant_name FROM posts p LEFT JOIN tenants t ON p.tenant_id = t.id WHERE p.tenant_id = ? ORDER BY p.created_at DESC LIMIT 5"
        )
        .all(tenantFilter) as PostRow[])
    : (db
        .prepare(
          "SELECT p.*, t.name as tenant_name FROM posts p LEFT JOIN tenants t ON p.tenant_id = t.id ORDER BY p.created_at DESC LIMIT 5"
        )
        .all() as PostRow[]);

  const platformStats = tenantFilter
    ? (db
        .prepare(
          "SELECT pl.type, pl.token_expires_at, t.name as tenant_name FROM platforms pl JOIN tenants t ON pl.tenant_id = t.id WHERE pl.tenant_id = ? ORDER BY pl.type"
        )
        .all(tenantFilter) as PlatformHealthRow[])
    : (db
        .prepare(
          "SELECT pl.type, pl.token_expires_at, t.name as tenant_name FROM platforms pl JOIN tenants t ON pl.tenant_id = t.id ORDER BY pl.type"
        )
        .all() as PlatformHealthRow[]);

  const postStatusSummary = db
    .prepare(
      `SELECT p.status, COUNT(*) as count
       FROM posts p
       ${postTenantClause}
       GROUP BY p.status`
    )
    .all(...postTenantArgs) as NamedCountRow[];

  const runStatusSummary = db
    .prepare(
      `SELECT pr.status, COUNT(*) as count
       FROM pipeline_runs pr
       JOIN pipeline_templates pt ON pt.id = pr.template_id
       ${pipelineTenantClause}
       GROUP BY pr.status`
    )
    .all(...pipelineTenantArgs) as NamedCountRow[];

  const overdueScheduled = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM posts p
       ${tenantFilter ? "WHERE p.tenant_id = ? AND" : "WHERE"} p.status = 'scheduled'
         AND p.scheduled_at IS NOT NULL
         AND datetime(replace(replace(p.scheduled_at, 'T', ' '), 'Z', '')) <= datetime('now')`
    )
    .get(...postTenantArgs) as CountRow;

  const stuckPosts = db
    .prepare(
      `SELECT p.id, p.caption, p.status, p.updated_at, p.scheduled_at, t.name as tenant_name
       FROM posts p
       LEFT JOIN tenants t ON t.id = p.tenant_id
       ${tenantFilter ? "WHERE p.tenant_id = ? AND" : "WHERE"} p.status = 'publishing'
         AND datetime(replace(replace(p.updated_at, 'T', ' '), 'Z', '')) <= datetime('now', '-15 minutes')
       ORDER BY p.updated_at ASC
       LIMIT 6`
    )
    .all(...postTenantArgs) as PostRow[];

  const partialPublishes = db
    .prepare(
      `SELECT p.id, p.caption, p.scheduled_at, p.updated_at, t.name as tenant_name,
              SUM(CASE WHEN pr.status = 'success' THEN 1 ELSE 0 END) as success_count,
              SUM(CASE WHEN pr.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
              GROUP_CONCAT(CASE WHEN pr.status = 'failed' THEN pr.platform END, ', ') as failed_platforms
       FROM posts p
       JOIN publish_results pr ON pr.post_id = p.id
       LEFT JOIN tenants t ON t.id = p.tenant_id
       ${postTenantClause}
       GROUP BY p.id, p.caption, p.scheduled_at, p.updated_at, t.name
       HAVING success_count > 0 AND failed_count > 0
       ORDER BY p.updated_at DESC
       LIMIT 5`
    )
    .all(...postTenantArgs) as PartialPublishRow[];

  const recentPublishFailures = db
    .prepare(
      `SELECT pr.id, pr.platform, pr.error, COALESCE(pr.published_at, p.updated_at, p.created_at) as created_at,
              p.id as post_id, p.caption, t.name as tenant_name
       FROM publish_results pr
       JOIN posts p ON p.id = pr.post_id
       LEFT JOIN tenants t ON t.id = p.tenant_id
       ${tenantFilter ? "WHERE p.tenant_id = ? AND pr.status = 'failed'" : "WHERE pr.status = 'failed'"}
       ORDER BY pr.id DESC
       LIMIT 6`
    )
    .all(...postTenantArgs) as PublishFailureRow[];

  const activeRuns = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM pipeline_runs pr
       JOIN pipeline_templates pt ON pt.id = pr.template_id
       ${tenantFilter ? "WHERE pt.tenant_id = ? AND" : "WHERE"} pr.status IN ('generating', 'publishing')`
    )
    .get(...pipelineTenantArgs) as CountRow;

  const stuckRuns = db
    .prepare(
      `SELECT pr.id, pr.status, pr.error, pr.started_at, pr.completed_at, pr.created_at,
              pt.name as template_name, t.name as tenant_name
       FROM pipeline_runs pr
       JOIN pipeline_templates pt ON pt.id = pr.template_id
       LEFT JOIN tenants t ON t.id = pt.tenant_id
       ${tenantFilter ? "WHERE pt.tenant_id = ? AND" : "WHERE"} pr.status IN ('generating', 'publishing')
         AND pr.started_at IS NOT NULL
         AND datetime(replace(replace(pr.started_at, 'T', ' '), 'Z', '')) <= datetime('now', '-15 minutes')
       ORDER BY pr.started_at ASC
       LIMIT 6`
    )
    .all(...pipelineTenantArgs) as PipelineRunRow[];

  const recentRunFailures = db
    .prepare(
      `SELECT pr.id, pr.status, pr.error, pr.started_at, pr.completed_at, pr.created_at,
              pt.name as template_name, t.name as tenant_name
       FROM pipeline_runs pr
       JOIN pipeline_templates pt ON pt.id = pr.template_id
       LEFT JOIN tenants t ON t.id = pt.tenant_id
       ${tenantFilter ? "WHERE pt.tenant_id = ? AND pr.status = 'failed'" : "WHERE pr.status = 'failed'"}
       ORDER BY COALESCE(pr.completed_at, pr.created_at) DESC
       LIMIT 6`
    )
    .all(...pipelineTenantArgs) as PipelineRunRow[];

  const postCounts = toCountMap(postStatusSummary);
  const runCounts = toCountMap(runStatusSummary);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-zinc-400">
            Operations snapshot for approvals, posting, and pipeline health
          </p>
        </div>

        <form className="flex items-center gap-2">
          <label htmlFor="tenant_id" className="text-xs text-zinc-400">
            Filter:
          </label>
          <select
            id="tenant_id"
            name="tenant_id"
            defaultValue={tenantFilter || ""}
            className="rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">All tenants</option>
            {allTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <TenantFilterScript />
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Tenants" value={tenants.count} />
        <StatCard title="Total Posts" value={posts.count} />
        <StatCard title="Pending Approval" value={pending.count} highlight={pending.count > 0} />
        <StatCard title="Due To Publish" value={overdueScheduled.count} highlight={overdueScheduled.count > 0} tone={overdueScheduled.count > 0 ? "amber" : "default"} />
        <StatCard title="Publishing Now" value={postCounts.publishing ?? 0} highlight={(postCounts.publishing ?? 0) > 0} tone={(postCounts.publishing ?? 0) > 0 ? "blue" : "default"} />
        <StatCard title="Active Pipeline Runs" value={activeRuns.count} highlight={activeRuns.count > 0} tone={activeRuns.count > 0 ? "blue" : "default"} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-zinc-200">Posting health</h3>
              <p className="text-xs text-zinc-500">Whether scheduled publishing is moving, failing, or partially completing.</p>
            </div>
            <Link href="/posts" className="text-xs text-zinc-500 hover:text-zinc-300">View posts →</Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Scheduled" value={postCounts.scheduled ?? 0} />
            <MiniStat label="Publishing" value={postCounts.publishing ?? 0} tone="blue" />
            <MiniStat label="Published" value={postCounts.published ?? 0} tone="green" />
            <MiniStat label="Failed" value={postCounts.failed ?? 0} tone="red" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <HealthList
              title={`Partial publishes${partialPublishes.length ? ` (${partialPublishes.length})` : ""}`}
              empty="No mixed publish outcomes yet."
              items={partialPublishes.map((row) => ({
                key: `partial-${row.id}`,
                title: truncate(row.caption, 72) || `Post #${row.id}`,
                meta: [row.tenant_name, `${row.success_count} success`, `${row.failed_count} failed`, relativeTime(row.updated_at)].filter(Boolean).join(" • "),
                detail: row.failed_platforms ? `Failed: ${row.failed_platforms}` : "One or more platform publishes failed.",
                href: "/posts",
                tone: "amber",
              }))}
            />

            <HealthList
              title={`Publish failures${recentPublishFailures.length ? ` (${recentPublishFailures.length})` : ""}`}
              empty="No publish failures recorded."
              items={recentPublishFailures.map((row) => ({
                key: `publish-failure-${row.id}`,
                title: `${capitalize(row.platform)} failure • ${truncate(row.caption, 52) || `Post #${row.post_id}`}`,
                meta: [row.tenant_name, relativeTime(row.created_at)].filter(Boolean).join(" • "),
                detail: row.error || "Unknown publish error",
                href: "/posts",
                tone: "red",
              }))}
            />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-zinc-200">Pipeline health</h3>
            <p className="text-xs text-zinc-500">Current run activity, stuck generation, and recent execution failures.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Generating" value={runCounts.generating ?? 0} tone="blue" />
            <MiniStat label="Preview" value={runCounts.preview ?? 0} />
            <MiniStat label="Published" value={runCounts.published ?? 0} tone="green" />
            <MiniStat label="Failed" value={runCounts.failed ?? 0} tone="red" />
          </div>

          <div className="mt-4 space-y-4">
            <HealthList
              title={`Stuck runs${stuckRuns.length ? ` (${stuckRuns.length})` : ""}`}
              empty="No pipeline runs look stuck right now."
              items={stuckRuns.map((run) => ({
                key: `stuck-run-${run.id}`,
                title: truncate(run.template_name, 60) || `Run #${run.id}`,
                meta: [run.tenant_name, formatStatus(run.status), startedLabel(run.started_at)].filter(Boolean).join(" • "),
                detail: run.error || "Run has been active for more than 15 minutes.",
                href: "/pipeline-health",
                tone: "amber",
              }))}
            />

            <HealthList
              title={`Run failures${recentRunFailures.length ? ` (${recentRunFailures.length})` : ""}`}
              empty="No pipeline failures recorded."
              items={recentRunFailures.map((run) => ({
                key: `run-failure-${run.id}`,
                title: truncate(run.template_name, 60) || `Run #${run.id}`,
                meta: [run.tenant_name, finishedLabel(run.completed_at || run.created_at)].filter(Boolean).join(" • "),
                detail: run.error || "Run failed without an error message.",
                href: "/pipeline-health",
                tone: "red",
              }))}
            />
          </div>
        </div>
      </div>

      {stuckPosts.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-zinc-900/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-amber-400">Publishing appears stuck</h3>
              <p className="text-xs text-zinc-500">Posts that have been in publishing for more than 15 minutes.</p>
            </div>
            <Link href="/posts?status=publishing" className="text-xs text-zinc-500 hover:text-zinc-300">Open posts →</Link>
          </div>
          <div className="space-y-2">
            {stuckPosts.map((post) => (
              <div key={post.id} className="rounded-md border border-amber-500/10 bg-amber-500/5 px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-100">{truncate(post.caption, 96) || `Post #${post.id}`}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {[post.tenant_name, startedLabel(post.updated_at), post.scheduled_at ? `Scheduled ${relativeTime(post.scheduled_at)}` : null].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                  <StatusBadge status={post.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingPosts.length > 0 && (
        <div className="rounded-lg border border-orange-500/20 bg-zinc-900/60 p-4">
          <h3 className="mb-3 text-sm font-medium text-orange-400">
            🔔 Pending Approval ({pendingPosts.length})
          </h3>
          <div className="space-y-2">
            {pendingPosts.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 rounded-md bg-zinc-800/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="max-w-full truncate text-xs text-zinc-200 sm:max-w-[280px]">
                      {p.caption ? (p.caption.length > 80 ? p.caption.slice(0, 80) + "…" : p.caption) : "No caption"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                    {p.tenant_name && <span>{p.tenant_name}</span>}
                    {p.created_at && <span>{new Date(p.created_at).toLocaleDateString()}</span>}
                    {p.platforms && (
                      <div className="flex gap-1">
                        {safeJsonArray(p.platforms).map((pl) => (
                          <span key={pl} className="rounded bg-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-300 capitalize">
                            {pl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:ml-3">
                  <ApproveButton postId={p.id} />
                  <RejectButton postId={p.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-300">Platform Health</h3>
          {platformStats.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No platforms configured yet. Add tenants and connect platforms to see status here.
            </p>
          ) : (
            <div className="space-y-2">
              {platformStats.map((p, i) => {
                const status = getTokenStatus(p.token_expires_at);
                return (
                  <div key={i} className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium capitalize text-zinc-200">{p.type}</span>
                      <span className="text-xs text-zinc-500">({p.tenant_name})</span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        status === "valid" ? "text-emerald-400" : status === "expiring" ? "text-amber-400" : "text-red-400"
                      }`}
                    >
                      {status === "valid" ? "● Connected" : status === "expiring" ? "● Expiring Soon" : "● Expired"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Recent Posts</h3>
            <Link href="/posts" className="text-xs text-zinc-500 hover:text-zinc-300">View all →</Link>
          </div>
          {recentPosts.length === 0 ? (
            <p className="text-xs text-zinc-500">No posts yet. Create your first post from the Posts page.</p>
          ) : (
            <div className="space-y-2">
              {recentPosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.id}`}
                  className="block rounded-md bg-zinc-800/50 px-3 py-2 hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="max-w-[160px] truncate text-xs text-zinc-200 sm:max-w-[220px]">
                      {p.caption ? (p.caption.length > 60 ? p.caption.slice(0, 60) + "…" : p.caption) : "No caption"}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                    {p.tenant_name && <span>{p.tenant_name}</span>}
                    {p.created_at && <span>{new Date(p.created_at).toLocaleDateString()}</span>}
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

/**
 * Inline script component to handle tenant filter navigation without a client component.
 * Attaches an onchange listener to the select element.
 */
function TenantFilterScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('tenant_id')?.addEventListener('change', function(e) {
            var val = e.target.value;
            if (val) {
              window.location.href = '/dashboard?tenant_id=' + encodeURIComponent(val);
            } else {
              window.location.href = '/dashboard';
            }
          });
        `,
      }}
    />
  );
}

function StatCard({
  title,
  value,
  highlight,
  tone = "default",
}: {
  title: string;
  value: number;
  highlight?: boolean;
  tone?: "default" | "amber" | "blue";
}) {
  const colorMap = {
    default: highlight ? "text-amber-400" : "text-white",
    amber: "text-amber-400",
    blue: "text-sky-400",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${colorMap[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "blue" | "green" | "red";
}) {
  const tones = {
    default: "border-white/10 text-zinc-100",
    blue: "border-sky-500/20 text-sky-400",
    green: "border-emerald-500/20 text-emerald-400",
    red: "border-red-500/20 text-red-400",
  };

  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/50 px-3 py-3">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function HealthList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: {
    key: string;
    title: string;
    meta: string;
    detail: string;
    href: string;
    tone: "amber" | "red";
  }[];
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-zinc-300">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-md border border-white/10 bg-zinc-950/40 px-3 py-3 text-xs text-zinc-500">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`block rounded-md border px-3 py-3 transition-colors hover:bg-zinc-800 ${
                item.tone === "red"
                  ? "border-red-500/10 bg-red-500/5"
                  : "border-amber-500/10 bg-amber-500/5"
              }`}
            >
              <div className="text-xs font-medium text-zinc-100">{item.title}</div>
              {item.meta && <div className="mt-1 text-[11px] text-zinc-500">{item.meta}</div>}
              <div className="mt-2 line-clamp-3 text-[11px] text-zinc-300">{item.detail}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-zinc-700 text-zinc-300",
    pending_approval: "bg-amber-900/50 text-amber-400",
    approved: "bg-blue-900/50 text-blue-400",
    scheduled: "bg-purple-900/50 text-purple-400",
    publishing: "bg-sky-900/50 text-sky-400",
    published: "bg-emerald-900/50 text-emerald-400",
    failed: "bg-red-900/50 text-red-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        colors[status] || "bg-zinc-700 text-zinc-300"
      }`}
    >
      {formatStatus(status)}
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

function toCountMap(rows: NamedCountRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});
}

function safeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function truncate(value: string | null | undefined, max: number) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const diffMs = Date.now() - then;
  const diffMinutes = Math.round(Math.abs(diffMs) / 60000);

  if (diffMinutes < 1) return diffMs >= 0 ? "just now" : "in <1m";
  if (diffMinutes < 60) return diffMs >= 0 ? `${diffMinutes}m ago` : `in ${diffMinutes}m`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return diffMs >= 0 ? `${diffHours}h ago` : `in ${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  return diffMs >= 0 ? `${diffDays}d ago` : `in ${diffDays}d`;
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function startedLabel(value: string | null | undefined) {
  return value ? `started ${relativeTime(value)}` : "start unknown";
}

function finishedLabel(value: string | null | undefined) {
  return value ? `finished ${relativeTime(value)}` : "finish unknown";
}
