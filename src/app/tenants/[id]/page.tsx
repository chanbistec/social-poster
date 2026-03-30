import Link from "next/link";
import db from "@/lib/db";
import type { PlatformType } from "@/lib/types";
import { decrypt } from "@/lib/crypto";
import PlatformCard from "@/components/platform-card";
import PlatformActions from "./platform-actions";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tenant = db
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(id) as any;

  if (!tenant) {
    return (
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6">
        Tenant not found
      </div>
    );
  }

  const rawPlatforms = db
    .prepare("SELECT * FROM platforms WHERE tenant_id = ? ORDER BY type")
    .all(id) as any[];

  // Deserialize for client components (mask credentials server-side)
  const platforms = rawPlatforms.map((p) => {
    let creds: Record<string, unknown> = {};
    try {
      creds = JSON.parse(decrypt(p.credentials));
      // Mask all values for display
      for (const key of Object.keys(creds)) {
        creds[key] = "••••••••";
      }
    } catch {
      /* corrupted or empty */
    }

    let config: Record<string, unknown> | null = null;
    try {
      config = p.config ? JSON.parse(p.config) : null;
    } catch {
      /* invalid */
    }

    return {
      id: p.id as number,
      type: p.type as PlatformType,
      credentials: creds,
      config,
      tokenExpiresAt: p.token_expires_at as string | null,
      enabled: !!p.enabled,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">
            Platform Connections
          </h3>
          <PlatformActions tenantId={id} />
        </div>

        {platforms.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">
            No platforms connected yet. Add one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {platforms.map((p) => (
              <PlatformCard
                key={p.id}
                id={p.id}
                tenantId={id}
                type={p.type}
                credentials={p.credentials}
                config={p.config}
                tokenExpiresAt={p.tokenExpiresAt}
                enabled={p.enabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
