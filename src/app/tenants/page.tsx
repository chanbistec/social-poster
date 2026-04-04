import Link from "next/link";
import db from "@/lib/db";

export const dynamic = 'force-dynamic';

export default async function TenantsPage() {
  const tenants = db
    .prepare(
      `SELECT t.id, t.name, t.description,
              (SELECT COUNT(*) FROM platforms p WHERE p.tenant_id = t.id) as platform_count
       FROM tenants t ORDER BY t.name` 
    )
    .all() as { id: string; name: string; description: string | null; platform_count: number }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-sm text-zinc-400">
            Manage businesses and their platform credentials
          </p>
        </div>
        <Link
          href="/tenants/new"
          className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-400 min-h-[44px] w-full sm:w-auto"
        >
          + Create Tenant
        </Link>
      </div>

      <div className="grid gap-4">
        {tenants.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6 text-sm text-zinc-400">
            No tenants yet. Create your first tenant.
          </div>
        )}

        {tenants.map((t) => (
          <Link
            key={t.id}
            href={`/tenants/${t.id}`}
            className="rounded-lg border border-white/10 bg-zinc-900/60 p-4 hover:border-orange-400/40"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{t.name}</h2>
                <p className="text-xs text-zinc-400">{t.description || "—"}</p>
              </div>
              <div className="text-xs text-zinc-400">
                {t.platform_count} platform(s)
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
