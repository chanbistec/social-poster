import Link from "next/link";
import db from "@/lib/db";
import PlatformBadge from "@/components/platform-badge";

function statusFromExpiry(expiry?: string | null) {
  if (!expiry) return "valid" as const;
  const exp = new Date(expiry).getTime();
  const now = Date.now();
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  if (days < 0) return "expired" as const;
  if (days < 7) return "expiring" as const;
  return "valid" as const;
}

export default async function TenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const tenant = db
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(params.id) as any;

  if (!tenant) {
    return (
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6">
        Tenant not found
      </div>
    );
  }

  const platforms = db
    .prepare("SELECT * FROM platforms WHERE tenant_id = ? ORDER BY type")
    .all(params.id) as any[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{tenant.name}</h1>
          <p className="text-sm text-zinc-400">{tenant.description || "—"}</p>
        </div>
        <Link
          href="/tenants"
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Back to tenants
        </Link>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <h3 className="mb-2 text-sm font-medium text-zinc-300">
          Platform Connections
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {platforms.length === 0 && (
            <div className="text-xs text-zinc-500">No platforms connected</div>
          )}
          {platforms.map((p) => (
            <PlatformBadge
              key={p.id}
              platform={p.type}
              status={statusFromExpiry(p.token_expires_at)}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Manage credentials via API for now (UI coming in Wave 3+).
        </p>
      </div>
    </div>
  );
}
