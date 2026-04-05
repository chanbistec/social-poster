import Link from "next/link";
export const dynamic = "force-dynamic";
import db from "@/lib/db";
import {
  getPipelineHealthSummary,
  isStuck,
  type PipelineHealthRow,
} from "@/lib/pipeline-health";

type Search = {
  tenant_id?: string;
  status?: string;
  template_id?: string;
  platform?: string;
  issue?: string;
};

const RUN_STATUSES = ["generating", "preview", "approved", "publishing", "published", "failed"];
const ISSUE_FILTERS = [
  { value: "", label: "All issues" },
  { value: "stuck", label: "Stuck runs" },
  { value: "failed", label: "Failed runs" },
  { value: "partial", label: "Partial publishes" },
];
const PLATFORMS = ["youtube", "instagram", "facebook"];

export default async function PipelineHealthPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const filters = {
    tenantId: params.tenant_id || undefined,
    status: params.status || undefined,
    templateId: params.template_id || undefined,
    platform: params.platform || undefined,
    issue: params.issue || undefined,
  };

  const { rows, counts } = getPipelineHealthSummary(filters);
  const tenants = db
    .prepare("SELECT id, name FROM tenants ORDER BY name")
    .all() as { id: string; name: string }[];
  const templates = db
    .prepare(
      `SELECT pt.id, pt.name, t.name as tenant_name
       FROM pipeline_templates pt
       LEFT JOIN tenants t ON t.id = pt.tenant_id
       ORDER BY t.name, pt.name`
    )
    .all() as { id: number; name: string; tenant_name: string | null }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline Health</h1>
          <p className="text-sm text-zinc-400">
            Filter stuck runs, recent failures, and partial publish outcomes across tenants.
          </p>
        </div>
        <Link
          href="/pipelines"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-white/10 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Back to Pipelines
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard title="Runs" value={counts.total} />
        <StatCard title="Generating" value={counts.generating} tone="blue" />
        <StatCard title="Preview" value={counts.preview} />
        <StatCard title="Publishing" value={counts.publishing} tone="blue" />
        <StatCard title="Published" value={counts.published} tone="green" />
        <StatCard title="Failed" value={counts.failed} tone="red" />
        <StatCard title="Stuck" value={counts.stuck} tone="amber" />
        <StatCard title="Partial" value={counts.partial} tone="amber" />
      </div>

      <form method="GET" className="grid gap-3 rounded-lg border border-white/10 bg-zinc-900/60 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <FilterSelect label="Tenant" name="tenant_id" defaultValue={params.tenant_id || ""}>
          <option value="">All tenants</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
          ))}
        </FilterSelect>

        <FilterSelect label="Status" name="status" defaultValue={params.status || ""}>
          <option value="">All statuses</option>
          {RUN_STATUSES.map((status) => (
            <option key={status} value={status}>{formatStatus(status)}</option>
          ))}
        </FilterSelect>

        <FilterSelect label="Pipeline" name="template_id" defaultValue={params.template_id || ""}>
          <option value="">All pipelines</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.tenant_name ? `${template.tenant_name} · ${template.name}` : template.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="Platform" name="platform" defaultValue={params.platform || ""}>
          <option value="">All platforms</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>{capitalize(platform)}</option>
          ))}
        </FilterSelect>

        <FilterSelect label="Issue" name="issue" defaultValue={params.issue || ""}>
          {ISSUE_FILTERS.map((issue) => (
            <option key={issue.value || "all"} value={issue.value}>{issue.label}</option>
          ))}
        </FilterSelect>

        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-5">
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-400"
          >
            Apply filters
          </button>
          <Link
            href="/pipeline-health"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="rounded-lg border border-white/10 bg-zinc-900/60">
        <div className="border-b border-white/10 px-4 py-3 text-sm text-zinc-400">
          {rows.length} run{rows.length === 1 ? "" : "s"} matched
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">No runs matched these filters.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((row) => (
              <PipelineHealthCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineHealthCard({ row }: { row: PipelineHealthRow }) {
  const stuck = isStuck(row.status, row.started_at);
  const partial = Boolean(row.last_failed_platforms) && Boolean(row.success_platforms);

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/pipeline-runs/${row.id}`} className="text-sm font-medium text-zinc-100 hover:text-orange-400">
              Run #{row.id}
            </Link>
            <StatusBadge status={row.status} />
            {stuck && <FlagBadge label="Stuck" tone="amber" />}
            {partial && <FlagBadge label="Partial publish" tone="amber" />}
            {row.last_failed_platforms && <FlagBadge label="Retry available" tone="red" />}
          </div>

          <div className="text-sm text-zinc-300">
            {row.template_name || `Template #${row.template_id}`}
            {row.tenant_name ? <span className="text-zinc-500"> · {row.tenant_name}</span> : null}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>Created {formatDateTime(row.created_at)}</span>
            {row.started_at ? <span>Started {relativeTime(row.started_at)}</span> : null}
            {row.completed_at ? <span>Completed {relativeTime(row.completed_at)}</span> : null}
            {row.total_publish_attempts > 0 ? <span>{row.total_publish_attempts} publish event{row.total_publish_attempts === 1 ? "" : "s"}</span> : null}
          </div>

          {row.error ? (
            <p className="max-w-3xl rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              {row.error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 text-xs">
            {row.success_platforms ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                Success: {row.success_platforms}
              </span>
            ) : null}
            {row.last_failed_platforms ? (
              <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-red-300">
                Failed: {row.last_failed_platforms}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link
            href={`/pipeline-runs/${row.id}`}
            className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            View run
          </Link>
          {row.post_id ? (
            <Link
              href={`/posts/${row.post_id}`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              View post
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="min-h-[44px] w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white"
      >
        {children}
      </select>
    </label>
  );
}

function StatCard({ title, value, tone = "default" }: { title: string; value: number; tone?: "default" | "blue" | "green" | "red" | "amber" }) {
  const tones = {
    default: "text-zinc-100",
    blue: "text-sky-400",
    green: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className={`mt-2 text-2xl font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    generating: "bg-blue-500/20 text-blue-300",
    preview: "bg-amber-500/20 text-amber-300",
    approved: "bg-green-500/20 text-green-300",
    publishing: "bg-sky-500/20 text-sky-300",
    published: "bg-emerald-500/20 text-emerald-300",
    failed: "bg-red-500/20 text-red-300",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs ${colors[status] || "bg-zinc-700 text-zinc-300"}`}>{formatStatus(status)}</span>;
}

function FlagBadge({ label, tone }: { label: string; tone: "amber" | "red" }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs ${tone === "red" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>
      {label}
    </span>
  );
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function relativeTime(value: string | null) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const diff = Date.now() - then;
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (minutes < 1) return diff >= 0 ? "just now" : "in <1m";
  if (minutes < 60) return diff >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff >= 0 ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `${days}d ago` : `in ${days}d`;
}
