import Link from "next/link";
import db from "@/lib/db";
import type {
  ImagenConfig,
  PipelineRunStatus,
  TtsConfig,
  VideoConfig,
} from "@/lib/types";

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const template = db
    .prepare(
      `SELECT pt.*, t.name as tenant_name
       FROM pipeline_templates pt
       LEFT JOIN tenants t ON pt.tenant_id = t.id
       WHERE pt.id = ?`
    )
    .get(id) as (Record<string, unknown> & { tenant_name: string | null }) | undefined;

  if (!template) {
    return (
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6 text-zinc-400">
        Pipeline template not found.
      </div>
    );
  }

  const runs = db
    .prepare(
      `SELECT * FROM pipeline_runs WHERE template_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(id) as Array<Record<string, unknown>>;

  // Parse JSON config fields
  const platforms = parseJson<string[]>(template.platforms as string, []);
  const ttsConfig = parseJson<TtsConfig | null>(template.tts_config as string | null, null);
  const imagenConfig = parseJson<ImagenConfig | null>(
    template.imagen_config as string | null,
    null
  );
  const videoConfig = parseJson<VideoConfig | null>(
    template.video_config as string | null,
    null
  );
  const pipelineType = (template.type as string) ?? "custom";
  const isVideo = pipelineType === "reel" || pipelineType === "short";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{template.name as string}</h1>
          <TypeBadge type={pipelineType} />
        </div>
        <div className="flex items-center gap-3">
          {Boolean(template.tenant_name) && (
            <span className="text-sm text-zinc-400">{String(template.tenant_name)}</span>
          )}
          <Link
            href={`/pipelines/${id}/run`}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors"
          >
            Run Pipeline
          </Link>
        </div>
      </div>

      {Boolean(template.description) && (
        <p className="text-sm text-zinc-400">{String(template.description)}</p>
      )}

      {/* Config Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Platforms */}
        <ConfigCard title="Platforms">
          <div className="flex flex-wrap gap-2">
            {platforms.length > 0 ? (
              platforms.map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300 border border-white/10"
                >
                  {p}
                </span>
              ))
            ) : (
              <span className="text-sm text-zinc-500">None configured</span>
            )}
          </div>
        </ConfigCard>

        {/* TTS Config */}
        <ConfigCard title="TTS Config">
          {ttsConfig ? (
            <div className="space-y-1 text-sm">
              {Boolean(ttsConfig.model) && (
                <ConfigRow label="Model" value={String(ttsConfig.model)} />
              )}
              {Boolean(ttsConfig.voice) && (
                <ConfigRow label="Voice" value={String(ttsConfig.voice)} />
              )}
              {Boolean(ttsConfig.provider) && (
                <ConfigRow label="Provider" value={String(ttsConfig.provider)} />
              )}
              {ttsConfig.speed != null && (
                <ConfigRow label="Speed" value={`${String(ttsConfig.speed)}x`} />
              )}
              {Boolean(ttsConfig.language) && (
                <ConfigRow label="Language" value={String(ttsConfig.language)} />
              )}
            </div>
          ) : (
            <span className="text-sm text-zinc-500">Not configured</span>
          )}
        </ConfigCard>

        {/* Imagen Config */}
        <ConfigCard title="Imagen Config">
          {imagenConfig ? (
            <div className="space-y-1 text-sm">
              {Boolean(imagenConfig.model) && (
                <ConfigRow label="Model" value={String(imagenConfig.model)} />
              )}
              {Boolean(imagenConfig.aspect_ratio) && (
                <ConfigRow label="Aspect Ratio" value={String(imagenConfig.aspect_ratio)} />
              )}
              {imagenConfig.scenes != null && (
                <ConfigRow label="Scenes" value={String(imagenConfig.scenes)} />
              )}
              {Boolean(imagenConfig.style) && (
                <ConfigRow label="Style" value={String(imagenConfig.style)} />
              )}
              {Boolean(imagenConfig.resolution) && (
                <ConfigRow label="Resolution" value={String(imagenConfig.resolution)} />
              )}
            </div>
          ) : (
            <span className="text-sm text-zinc-500">Not configured</span>
          )}
        </ConfigCard>

        {/* Video Config — only for reel/short */}
        {isVideo && (
          <ConfigCard title="Video Config">
            {videoConfig ? (
              <div className="space-y-1 text-sm">
                {videoConfig.duration != null && (
                  <ConfigRow label="Timing" value={`${String(videoConfig.duration)}s`} />
                )}
                {videoConfig.audio != null && (
                  <ConfigRow label="Audio" value={String(videoConfig.audio)} />
                )}
                {videoConfig.fps != null && (
                  <ConfigRow label="FPS" value={String(videoConfig.fps)} />
                )}
                {Boolean(videoConfig.resolution) && (
                  <ConfigRow label="Resolution" value={String(videoConfig.resolution)} />
                )}
                {Boolean(videoConfig.codec) && (
                  <ConfigRow label="Codec" value={String(videoConfig.codec)} />
                )}
                {Boolean(videoConfig.transition) && (
                  <ConfigRow label="Transition" value={String(videoConfig.transition)} />
                )}
              </div>
            ) : (
              <span className="text-sm text-zinc-500">Not configured</span>
            )}
          </ConfigCard>
        )}
      </div>

      {/* Run History */}
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <h2 className="mb-4 text-lg font-medium">Run History</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500">No runs yet. Start your first run above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-zinc-400">
                  <th className="pb-2 pr-4 font-medium">ID</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Created</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id as number}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="py-2 pr-4 font-mono text-zinc-300">
                      #{run.id as number}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={run.status as PipelineRunStatus} />
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">
                      {formatDate(run.created_at as string)}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/pipeline-runs/${run.id}`}
                        className="text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ---------- Sub-components ---------- */

function ConfigCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-300">
      <span className="text-zinc-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    reel: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    short: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    social_image: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    custom: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[type] ?? colors.custom}`}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: PipelineRunStatus }) {
  const styles: Record<PipelineRunStatus, string> = {
    pending: "bg-zinc-500/20 text-zinc-400",
    generating: "bg-blue-500/20 text-blue-400 animate-pulse",
    preview: "bg-amber-500/20 text-amber-400",
    approved: "bg-green-500/20 text-green-400",
    publishing: "bg-blue-500/20 text-blue-400",
    published: "bg-emerald-500/20 text-emerald-400",
    failed: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
