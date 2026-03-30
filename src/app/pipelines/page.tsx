import Link from "next/link";
import db from "@/lib/db";

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  reel: { label: "Reel", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  short: { label: "Short", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  social_image: { label: "Social Image", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  custom: { label: "Custom", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
};

const PLATFORM_BADGES: Record<string, string> = {
  youtube: "bg-red-500/20 text-red-400",
  instagram: "bg-pink-500/20 text-pink-400",
  facebook: "bg-blue-600/20 text-blue-400",
};

export default async function PipelinesPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant_id?: string }>;
}) {
  const params = await searchParams;
  const tenantFilter = params.tenant_id || "";

  const conditions: string[] = [];
  const values: any[] = [];

  if (tenantFilter) {
    conditions.push("pt.tenant_id = ?");
    values.push(tenantFilter);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const pipelines = db
    .prepare(
      `SELECT pt.*, t.name as tenant_name,
              (SELECT COUNT(*) FROM pipeline_runs WHERE template_id = pt.id) as run_count
       FROM pipeline_templates pt
       LEFT JOIN tenants t ON pt.tenant_id = t.id
       ${where}
       ORDER BY pt.created_at DESC`
    )
    .all(...values) as any[];

  const tenants = db
    .prepare("SELECT id, name FROM tenants ORDER BY name")
    .all() as { id: string; name: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipelines</h1>
          <p className="text-sm text-zinc-400">
            Content generation pipeline templates
          </p>
        </div>
        <Link
          href="/pipelines/new"
          className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-400 min-h-[44px] w-full sm:w-auto"
        >
          + Create Pipeline
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

        <button
          type="submit"
          className="rounded-md bg-zinc-800 px-4 py-2.5 text-sm text-white hover:bg-zinc-700 border border-white/10 min-h-[44px] w-full sm:w-auto"
        >
          Filter
        </button>

        {tenantFilter && (
          <Link
            href="/pipelines"
            className="text-xs text-zinc-500 hover:text-zinc-300 py-2"
          >
            Clear filters
          </Link>
        )}
      </form>

      {/* Pipeline cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pipelines.length === 0 && (
          <div className="col-span-full rounded-lg border border-white/10 bg-zinc-900/60 p-8 text-center">
            <p className="text-sm text-zinc-400 mb-3">No pipeline templates found.</p>
            <Link
              href="/pipelines/new"
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              Create your first pipeline →
            </Link>
          </div>
        )}

        {pipelines.map((p: any) => {
          const typeBadge = TYPE_BADGES[p.type] || TYPE_BADGES.custom;
          let platforms: string[] = [];
          try {
            platforms = JSON.parse(p.platforms || "[]");
          } catch {
            /* ignore */
          }

          return (
            <Link
              key={p.id}
              href={`/pipelines/${p.id}`}
              className="group rounded-lg border border-white/10 bg-zinc-900/60 p-5 transition-colors hover:border-orange-500/30 hover:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-medium text-white group-hover:text-orange-400 transition-colors truncate">
                  {p.name}
                </h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${typeBadge.color}`}
                >
                  {typeBadge.label}
                </span>
              </div>

              {p.description && (
                <p className="text-xs text-zinc-500 mb-3 line-clamp-2">
                  {p.description}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-3">
                {platforms.map((pl: string) => (
                  <span
                    key={pl}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLATFORM_BADGES[pl] || "bg-zinc-700 text-zinc-300"}`}
                  >
                    {pl}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{p.tenant_name || "Unknown tenant"}</span>
                <div className="flex items-center gap-3">
                  <span>{p.run_count} run{p.run_count !== 1 ? "s" : ""}</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
