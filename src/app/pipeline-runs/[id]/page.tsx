import db from "@/lib/db";
import type { PipelineRunStatus } from "@/lib/types";
import RunActions from "./run-actions";
import RunProgressCard from "./run-progress-card";

type PublishResultRow = {
  id: number;
  platform: string;
  status: string;
  external_url: string | null;
  error: string | null;
  published_at: string | null;
};

type TimelineEvent = {
  key: string;
  time: string | null;
  title: string;
  detail: string;
  tone: "default" | "blue" | "green" | "amber" | "red";
  href?: string | null;
};

export default async function PipelineRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const run = db
    .prepare(
      `SELECT pr.*, pt.name as template_name, t.name as tenant_name
       FROM pipeline_runs pr
       JOIN pipeline_templates pt ON pr.template_id = pt.id
       JOIN tenants t ON pt.tenant_id = t.id
       WHERE pr.id = ?`
    )
    .get(id) as (Record<string, unknown> & {
    template_name: string;
    tenant_name: string;
  }) | undefined;

  if (!run) {
    return (
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6 text-zinc-400">
        Pipeline run not found.
      </div>
    );
  }

  const status = run.status as PipelineRunStatus;
  const inputParams = parseJson<Record<string, unknown>>(run.input_params as string, {});
  const stepResults = parseJson<Record<string, unknown>>(run.step_results as string | null, {});
  const outputPaths = parseJson<string[]>(run.output_paths as string | null, []);
  const errorMsg = run.error as string | null;
  const hashtags = Array.isArray(inputParams.hashtags)
    ? (inputParams.hashtags as string[])
    : [];

  const publishResults = run.post_id
    ? (db
        .prepare("SELECT * FROM publish_results WHERE post_id = ? ORDER BY id ASC")
        .all(run.post_id) as PublishResultRow[])
    : [];

  const latestPlatformResults = getLatestPlatformResults(publishResults);
  const latestFailedResults = latestPlatformResults.filter((result) => result.status === "failed");
  const timeline = buildTimeline({ run, publishResults, latestPlatformResults });

  return (
    <div className="space-y-6">
      <StatusBanner status={status} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Run #{run.id as number}</h1>
          <p className="text-sm text-zinc-400">
            {String(run.template_name)} · {String(run.tenant_name)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">Input Parameters</h2>
            <div className="space-y-2 text-sm">
              {Boolean(inputParams.title) && <ParamRow label="Title" value={String(inputParams.title)} />}
              {Boolean(inputParams.tip) && <ParamRow label="Tip" value={String(inputParams.tip)} />}
              {Boolean(inputParams.category) && <ParamRow label="Category" value={String(inputParams.category)} />}
              {hashtags.length > 0 && (
                <div>
                  <span className="text-zinc-500">Hashtags</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hashtags.map((h: string, i: number) => (
                      <span
                        key={i}
                        className="rounded-full border border-white/10 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                      >
                        #{h.replace(/^#/, "")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Boolean(inputParams.highlight) && (
                <ParamRow label="Highlight" value={String(inputParams.highlight)} />
              )}
            </div>
          </div>

          {Object.keys(stepResults).length > 0 && (
            <RunProgressCard
              runId={Number(id)}
              initialRun={{
                id: Number(run.id),
                status,
                step_results: stepResults,
                output_paths: outputPaths,
                error: errorMsg,
                completed_at: (run.completed_at as string | null) ?? null,
              }}
            />
          )}

          {outputPaths.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Generated Media</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {outputPaths.map((filePath, i) => {
                  const filename = filePath.split("/").pop() ?? filePath;
                  const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
                  const mediaUrl = `/api/media/pipeline-runs/${id}/${filename}`;

                  return isVideo ? (
                    <div key={i} className="overflow-hidden rounded-lg border border-white/10">
                      <video src={mediaUrl} controls className="w-full" preload="metadata" />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{filename}</p>
                    </div>
                  ) : (
                    <div key={i} className="overflow-hidden rounded-lg border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl} alt={`Generated media ${i + 1}`} className="w-full" />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{filename}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <h3 className="mb-1 text-sm font-medium text-red-400">Error</h3>
              <p className="break-all text-sm text-red-300">{errorMsg}</p>
            </div>
          )}

          {Object.keys(stepResults).length > 0 && (
            <details className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-300">Raw step payloads</summary>
              <div className="mt-3 space-y-3">
                {Object.entries(stepResults).map(([key, step], i) => {
                  const output = typeof step === "object" && step ? JSON.stringify(step, null, 2) : String(step);
                  return (
                    <div key={key} className="rounded-md border border-white/5 bg-zinc-800/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-300">Step {i + 1}</span>
                        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">{key}</span>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-zinc-400">{output}</pre>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {publishResults.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-zinc-300">Latest platform status</h2>
                {latestFailedResults.length > 0 ? (
                  <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
                    {latestFailedResults.length} failed platform{latestFailedResults.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                    All latest platform attempts succeeded
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {latestPlatformResults.map((result) => (
                  <div key={result.platform} className="flex flex-col gap-2 rounded-md border border-white/5 bg-zinc-800/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize text-zinc-200">{platformLabel(result.platform)}</span>
                        <span className={result.status === "success" ? "text-xs text-emerald-400" : "text-xs text-red-400"}>
                          {result.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {result.published_at ? formatDate(result.published_at) : "No success timestamp"}
                      </div>
                      {result.error ? <div className="mt-1 text-xs text-red-300">{result.error}</div> : null}
                    </div>
                    {result.external_url ? (
                      <a href={result.external_url} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-400 hover:text-orange-300">
                        View →
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          <RunActions
            runId={Number(id)}
            status={status}
            templateId={run.template_id as number}
            hasFailedPlatforms={latestFailedResults.length > 0}
          />
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-300">Publish Timeline</h2>
              <p className="text-xs text-zinc-500">Generation, approval, and platform-level publish history for this run.</p>
            </div>
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-zinc-500">No events recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {timeline.map((event, index) => (
                <div key={event.key} className="relative pl-6">
                  {index < timeline.length - 1 ? <div className="absolute left-[9px] top-6 h-[calc(100%+8px)] w-px bg-white/10" /> : null}
                  <div className={`absolute left-0 top-1 h-[18px] w-[18px] rounded-full border ${dotTone(event.tone)}`} />
                  <div className="rounded-md border border-white/5 bg-zinc-950/50 px-3 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{event.title}</div>
                        <div className="mt-1 text-xs text-zinc-400">{event.detail}</div>
                      </div>
                      <div className="text-xs text-zinc-500">{event.time ? formatDate(event.time) : "Pending"}</div>
                    </div>
                    {event.href ? (
                      <a href={event.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs text-orange-400 hover:text-orange-300">
                        Open published item →
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getLatestPlatformResults(results: PublishResultRow[]) {
  const latestByPlatform = new Map<string, PublishResultRow>();
  for (const result of results) {
    latestByPlatform.set(result.platform, result);
  }
  return Array.from(latestByPlatform.values()).sort((a, b) => a.platform.localeCompare(b.platform));
}

function buildTimeline({
  run,
  publishResults,
  latestPlatformResults,
}: {
  run: Record<string, unknown>;
  publishResults: PublishResultRow[];
  latestPlatformResults: PublishResultRow[];
}): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      key: "created",
      time: (run.created_at as string) ?? null,
      title: "Run created",
      detail: "Pipeline execution request was recorded.",
      tone: "default",
    },
    {
      key: "started",
      time: (run.started_at as string) ?? (run.created_at as string) ?? null,
      title: "Generation started",
      detail: "Assets started rendering.",
      tone: "blue",
    },
  ];

  if (run.completed_at) {
    events.push({
      key: "completed",
      time: run.completed_at as string,
      title: run.status === "failed" ? "Generation failed" : "Generation finished",
      detail: run.status === "failed"
        ? ((run.error as string | null) || "The pipeline failed during generation or publish handoff.")
        : "Output was generated and ready for review.",
      tone: run.status === "failed" ? "red" : "green",
    });
  }

  if (run.post_id) {
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(run.post_id) as Record<string, unknown> | undefined;
    if (post?.approved_at) {
      events.push({
        key: "approved",
        time: post.approved_at as string,
        title: "Approved for publishing",
        detail: post.approved_by ? `Approved by ${String(post.approved_by)}.` : "Approved and converted into a post.",
        tone: "green",
      });
    }
  }

  for (const result of publishResults) {
    events.push({
      key: `publish-${result.id}`,
      time: result.published_at,
      title: `${platformLabel(result.platform)} ${result.status === "success" ? successActionLabel(result.platform) : "failed"}`,
      detail: result.status === "success"
        ? successDetail(result.platform)
        : result.error || `${platformLabel(result.platform)} failed without a recorded error.`,
      tone: result.status === "success" ? "green" : "red",
      href: result.external_url,
    });
  }

  if (latestPlatformResults.length > 0) {
    const failedPlatforms = latestPlatformResults.filter((result) => result.status === "failed").map((result) => result.platform);
    if (failedPlatforms.length > 0) {
      events.push({
        key: "retry-hint",
        time: null,
        title: "Retry ready",
        detail: `One-click retry will target only failed platforms: ${failedPlatforms.join(", ")}.`,
        tone: "amber",
      });
    }
  }

  return events.sort((a, b) => {
    const aTime = a.time ? new Date(a.time).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.time ? new Date(b.time).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label}</span>
      <p className="text-zinc-300">{value}</p>
    </div>
  );
}

function StatusBanner({ status }: { status: PipelineRunStatus }) {
  const config: Record<PipelineRunStatus, { bg: string; text: string; label: string }> = {
    pending: { bg: "bg-zinc-700/50", text: "text-zinc-300", label: "Pending" },
    generating: { bg: "bg-orange-500/20", text: "text-orange-200", label: "Generating..." },
    preview: { bg: "bg-amber-500/20", text: "text-amber-300", label: "Ready for Review" },
    approved: { bg: "bg-green-500/20", text: "text-green-300", label: "Approved" },
    publishing: { bg: "bg-blue-500/20", text: "text-blue-300", label: "Publishing..." },
    published: { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "Published" },
    failed: { bg: "bg-red-500/20", text: "text-red-300", label: "Failed" },
  };

  const c = config[status] ?? config.pending;
  return <div className={`w-full rounded-lg ${c.bg} px-4 py-3 text-center text-sm font-medium ${c.text} ${status === "generating" ? "animate-pulse" : ""}`}>{c.label}</div>;
}

function dotTone(tone: TimelineEvent["tone"]) {
  switch (tone) {
    case "blue":
      return "border-blue-500/40 bg-blue-500/20";
    case "green":
      return "border-emerald-500/40 bg-emerald-500/20";
    case "amber":
      return "border-amber-500/40 bg-amber-500/20";
    case "red":
      return "border-red-500/40 bg-red-500/20";
    default:
      return "border-white/10 bg-zinc-700";
  }
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function platformLabel(platform: string) {
  switch (platform) {
    case "youtube_playlist":
      return "YouTube playlist";
    case "pipeline":
      return "Pipeline";
    default:
      return capitalize(platform.replace(/_/g, " "));
  }
}

function successActionLabel(platform: string) {
  switch (platform) {
    case "youtube_playlist":
      return "updated";
    default:
      return "published";
  }
}

function successDetail(platform: string) {
  switch (platform) {
    case "youtube_playlist":
      return "Playlist was created or updated and the video was added.";
    case "youtube":
      return "Video upload completed successfully.";
    default:
      return "Platform accepted the content.";
  }
}
