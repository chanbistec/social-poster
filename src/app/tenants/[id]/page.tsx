import Link from "next/link";
import db from "@/lib/db";
import type { PipelineTemplate, PlatformType, TenantBranding } from "@/lib/types";
import { decrypt } from "@/lib/crypto";
import PlatformCard from "@/components/platform-card";
import PlatformActions from "./platform-actions";
import BrandingSection from "./branding-section";

type PipelineSummary = Pick<PipelineTemplate, "id" | "name" | "type" | "steps" | "description">;

type PipelineStepConfig = {
  privacy?: string;
  viva_engage?: boolean;
  viva_group?: string;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getStepConfig(template: PipelineSummary, type: string) {
  const steps = parseJson<Array<{ type?: string; config?: PipelineStepConfig }>>(template.steps, []);
  return steps.find((step) => step.type === type)?.config ?? {};
}

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

  const pipelines = db
    .prepare("SELECT id, name, type, steps, description FROM pipeline_templates WHERE tenant_id = ? ORDER BY name")
    .all(id) as PipelineSummary[];

  const academyPipeline = pipelines.find((pipeline) => pipeline.type === "custom");
  const academyUploadConfig = academyPipeline ? getStepConfig(academyPipeline, "upload_video") : {};
  const academyPlaylistConfig = academyPipeline ? getStepConfig(academyPipeline, "playlist_add") : {};

  // Fetch branding
  const brandingRow = db
    .prepare("SELECT * FROM tenant_branding WHERE tenant_id = ?")
    .get(id) as TenantBranding | undefined;

  const branding = brandingRow
    ? {
        ...brandingRow,
        colors: JSON.parse(brandingRow.colors || "{}"),
        fonts: JSON.parse(brandingRow.fonts || "{}"),
        backgrounds: JSON.parse(brandingRow.backgrounds || "{}"),
      }
    : null;

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

      {academyPipeline ? (
        <div className="rounded-lg border border-orange-500/20 bg-zinc-900/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-orange-200">
                Academy video pipeline
              </div>
              <h3 className="mt-3 text-lg font-medium text-zinc-100">{academyPipeline.name}</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {academyPipeline.description || "Upload a finished academy video, publish it to YouTube, add it to a playlist, and optionally share it to Viva Engage."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/pipelines/${academyPipeline.id}/run`}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
              >
                Upload academy video
              </Link>
              <Link
                href={`/pipelines/${academyPipeline.id}`}
                className="rounded-lg border border-white/10 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-zinc-900"
              >
                View pipeline
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">YouTube privacy</div>
              <div className="mt-1 text-sm text-zinc-200">{academyUploadConfig.privacy || "unlisted"}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Playlist handling</div>
              <div className="mt-1 text-sm text-zinc-200">
                {academyPlaylistConfig.privacy || academyUploadConfig.privacy || "unlisted"} playlist visibility
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Viva Engage</div>
              <div className="mt-1 text-sm text-zinc-200">
                {academyUploadConfig.viva_engage
                  ? academyUploadConfig.viva_group
                    ? `Enabled, group ${academyUploadConfig.viva_group}`
                    : "Enabled"
                  : "Disabled"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pipelines.length > 0 ? (
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-zinc-300">Pipelines</h3>
            <Link href="/pipelines" className="text-xs text-zinc-400 hover:text-white">
              View all pipelines →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pipelines.map((pipeline) => (
              <div key={pipeline.id} className="rounded-lg border border-white/10 bg-zinc-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{pipeline.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{pipeline.type}</div>
                  </div>
                  <Link href={`/pipelines/${pipeline.id}`} className="text-xs text-orange-400 hover:text-orange-300">
                    Open →
                  </Link>
                </div>
                {pipeline.description ? (
                  <p className="mt-3 text-sm text-zinc-400">{pipeline.description}</p>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">No description added yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Branding */}
      <BrandingSection tenantId={id} initialBranding={branding} />
    </div>
  );
}
