import Link from "next/link";
import db from "@/lib/db";
import type {
  ImagenConfig,
  PipelineRunStatus,
  PlatformType,
  TtsConfig,
  VideoConfig,
  VideoPlatformSafeZoneConfig,
} from "@/lib/types";
import { DEFAULT_VIDEO_SAFE_ZONES as SAFE_ZONE_DEFAULTS } from "@/lib/types";

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

  const runRows = runs.map((run) => {
    const stepResults = parseJson<Record<string, unknown>>(run.step_results as string | null, {});
    const outputPaths = parseJson<string[]>(run.output_paths as string | null, []);
    return {
      ...run,
      parsedStepResults: stepResults,
      parsedOutputPaths: outputPaths,
      progress: summarizeRunProgress(run.status as PipelineRunStatus, stepResults, outputPaths),
    };
  });

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
  const safeZones = (videoConfig?.safe_zones ?? {}) as Partial<
    Record<PlatformType, VideoPlatformSafeZoneConfig>
  >;

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

        {isVideo && (
          <ConfigCard title="Video Safe Zones">
            <div className="space-y-3">
              <p className="text-xs leading-5 text-zinc-500">
                The renderer merges selected platform bounds conservatively, then places overlays
                inside those safe areas.
              </p>
              <div className="space-y-3">
                {(Object.keys(SAFE_ZONE_DEFAULTS) as PlatformType[]).map((platform) => {
                  const config = safeZones[platform] ?? SAFE_ZONE_DEFAULTS[platform];
                  const active = platforms.includes(platform);

                  return (
                    <div
                      key={platform}
                      className={`rounded-xl border p-3 ${
                        active
                          ? "border-orange-500/30 bg-orange-500/5"
                          : "border-white/10 bg-zinc-950/70"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-medium capitalize text-white">{platform}</span>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                            active
                              ? "bg-orange-500/15 text-orange-300"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {active ? "Selected" : "Preset"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 sm:grid-cols-4">
                        <MetricChip label="Top" value={`${config.safe_zone.top}px`} />
                        <MetricChip label="Bottom" value={`${config.safe_zone.bottom}px`} />
                        <MetricChip label="Left" value={`${config.safe_zone.left}px`} />
                        <MetricChip label="Right" value={`${config.safe_zone.right}px`} />
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                        <OverlaySummary
                          label="Logo"
                          anchor={config.overlays.logo.anchor}
                          offsetX={config.overlays.logo.offset_x ?? 0}
                          offsetY={config.overlays.logo.offset_y ?? 0}
                        />
                        <OverlaySummary
                          label="Watermark"
                          anchor={config.overlays.watermark.anchor}
                          offsetX={config.overlays.watermark.offset_x ?? 0}
                          offsetY={config.overlays.watermark.offset_y ?? 0}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ConfigCard>
        )}
      </div>

      {/* Run History */}
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <h2 className="mb-4 text-lg font-medium">Run History</h2>
        {runRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No runs yet. Start your first run above.</p>
        ) : (
          <div className="space-y-3">
            {runRows.map((run) => (
              <div
                key={run.id as number}
                className="rounded-xl border border-white/10 bg-zinc-950/70 p-4 transition-colors hover:border-white/15"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm text-zinc-300">#{run.id as number}</span>
                      <StatusBadge status={run.status as PipelineRunStatus} />
                      <span className="text-xs text-zinc-500">
                        Created {formatDate(run.created_at as string)}
                      </span>
                      {Boolean(run.scheduled_at) && (
                        <span className="text-xs text-zinc-500">
                          Scheduled {formatDate(run.scheduled_at as string)}
                        </span>
                      )}
                      {Boolean(run.completed_at) && (
                        <span className="text-xs text-zinc-500">
                          Finished {formatDate(run.completed_at as string)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">Progress</div>
                        <div className="mt-1 text-sm text-zinc-200">{run.progress.headline}</div>
                        {run.progress.detail ? (
                          <div className="mt-1 text-xs text-zinc-400">{run.progress.detail}</div>
                        ) : null}
                      </div>

                      {run.progress.outputs.length > 0 ? (
                        <div>
                          <div className="text-xs uppercase tracking-wide text-zinc-500">Results</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {run.progress.outputs.map((output) => (
                              <span
                                key={output}
                                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300"
                              >
                                {output}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <Link
                    href={`/pipeline-runs/${run.id}`}
                    className="inline-flex items-center text-sm text-orange-400 transition-colors hover:text-orange-300"
                  >
                    View run →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeRunProgress(
  status: PipelineRunStatus,
  stepResults: Record<string, unknown>,
  outputPaths: string[]
) {
  const normalizedSteps = Object.entries(stepResults).map(([key, raw]) => normalizeStep(key, raw));
  const runningStep = normalizedSteps.find((step) => step.state === "running");
  const failedStep = normalizedSteps.find((step) => step.state === "failed");
  const completedSteps = normalizedSteps.filter((step) => step.state === "completed");

  const outputs = buildRunOutputs(normalizedSteps, outputPaths);

  if (failedStep) {
    return {
      headline: `${failedStep.label} failed`,
      detail: failedStep.error || "The run stopped before finishing.",
      outputs,
    };
  }

  if (runningStep) {
    return {
      headline: `${runningStep.label} in progress`,
      detail:
        runningStep.summary ||
        runningStep.description ||
        `${completedSteps.length} step${completedSteps.length === 1 ? "" : "s"} completed so far.`,
      outputs,
    };
  }

  if (status === "published") {
    return {
      headline: "Published successfully",
      detail:
        completedSteps.at(-1)?.summary ||
        `${completedSteps.length} step${completedSteps.length === 1 ? "" : "s"} completed.`,
      outputs,
    };
  }

  if (status === "preview") {
    return {
      headline: "Ready for review",
      detail:
        completedSteps.at(-1)?.summary ||
        `${completedSteps.length} step${completedSteps.length === 1 ? "" : "s"} completed.`,
      outputs,
    };
  }

  return {
    headline: normalizedSteps.length > 0 ? "Queued pipeline run" : "Run created",
    detail:
      completedSteps.length > 0
        ? `${completedSteps.length} step${completedSteps.length === 1 ? "" : "s"} completed.`
        : "Waiting for the pipeline worker to start or for the scheduled time to arrive.",
    outputs,
  };
}

function buildRunOutputs(
  steps: Array<{
    key: string;
    label: string;
    state: string;
    summary?: string;
    description?: string;
    error?: string;
    result?: unknown;
  }>,
  outputPaths: string[]
) {
  const labels = new Set<string>();

  if (outputPaths.length > 0) {
    labels.add(`${outputPaths.length} file${outputPaths.length === 1 ? "" : "s"} saved`);
  }

  for (const step of steps) {
    if (step.state !== "completed") continue;

    if (step.key === "uploadVideo") {
      labels.add("YouTube upload complete");
    } else if (step.key === "playlistAdd") {
      labels.add("Playlist updated");
    } else if (step.key === "vivaEngage") {
      labels.add("Viva Engage posted");
    } else if (step.key === "video") {
      labels.add("Video rendered");
    } else if (step.key === "socialImage") {
      labels.add("Social image rendered");
    }
  }

  return [...labels];
}

function normalizeStep(key: string, raw: unknown) {
  if (raw && typeof raw === "object") {
    const step = raw as Record<string, unknown>;
    return {
      key,
      label: typeof step.label === "string" ? step.label : titleCase(key),
      description: typeof step.description === "string" ? step.description : undefined,
      state:
        step.state === "pending" ||
        step.state === "running" ||
        step.state === "completed" ||
        step.state === "failed"
          ? step.state
          : "pending",
      summary: typeof step.summary === "string" ? step.summary : undefined,
      error: typeof step.error === "string" ? step.error : undefined,
      result: step.result,
    };
  }

  return {
    key,
    label: titleCase(key),
    description: undefined,
    state: "completed",
    summary: typeof raw === "string" ? raw : undefined,
    error: undefined,
    result: raw,
  };
}

function titleCase(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 font-medium text-white">{value}</div>
    </div>
  );
}

function OverlaySummary({
  label,
  anchor,
  offsetX,
  offsetY,
}: {
  label: string;
  anchor: string;
  offsetX: number;
  offsetY: number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-zinc-200">{anchor}</div>
      <div className="mt-1 text-zinc-500">
        x {offsetX >= 0 ? "+" : ""}
        {offsetX}px · y {offsetY >= 0 ? "+" : ""}
        {offsetY}px
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
    pending: "bg-zinc-500/20 text-zinc-300",
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
