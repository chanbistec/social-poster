"use client";

import { useEffect, useMemo, useState } from "react";
import type { PipelineRunStatus, PlatformType } from "@/lib/types";
import RunActions from "./run-actions";
import RunProgressCard from "./run-progress-card";

type PublishResultRow = {
  id: number;
  platform: PlatformType;
  status: "success" | "failed";
  external_url: string | null;
  error: string | null;
  published_at: string | null;
};

type PostSummary = {
  approved_at: string | null;
  approved_by: string | null;
} | null;

type TimelineEvent = {
  key: string;
  time: string | null;
  title: string;
  detail: string;
  tone: "default" | "blue" | "green" | "amber" | "red";
  href?: string | null;
};

type RunSnapshot = {
  id: number;
  template_id: number;
  status: PipelineRunStatus;
  step_results: unknown;
  output_paths: string[] | null;
  error: string | null;
  completed_at: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  post_id?: number | null;
};

type LivePayload = {
  run: RunSnapshot;
  publishResults: PublishResultRow[];
  postSummary: PostSummary;
};

const ACTIVE_STATUSES: PipelineRunStatus[] = ["pending", "generating", "publishing"];

export default function RunLiveDetails({
  runId,
  templateId,
  initialRun,
  initialPublishResults,
  initialPostSummary,
  postPlatforms,
}: {
  runId: number;
  templateId: number;
  initialRun: RunSnapshot;
  initialPublishResults: PublishResultRow[];
  initialPostSummary: PostSummary;
  postPlatforms: PlatformType[];
}) {
  const [payload, setPayload] = useState<LivePayload>({
    run: initialRun,
    publishResults: initialPublishResults,
    postSummary: initialPostSummary,
  });
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(payload.run.status)) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/pipeline-runs/${runId}`, { cache: "no-store" });
        const next = await res.json();
        if (!res.ok) throw new Error(next.error || "Failed to refresh run details");
        if (!cancelled) {
          setPayload({
            run: next.data,
            publishResults: Array.isArray(next.publish_results) ? next.publish_results : [],
            postSummary: next.post_summary ?? null,
          });
          setRefreshError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshError(error instanceof Error ? error.message : "Failed to refresh run details");
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [payload.run.status, runId]);

  const latestPlatformResults = useMemo(() => getLatestPlatformResults(payload.publishResults), [payload.publishResults]);
  const latestFailedResults = useMemo(
    () => latestPlatformResults.filter((result) => result.status === "failed"),
    [latestPlatformResults],
  );
  const timeline = useMemo(
    () => buildTimeline({ run: payload.run, publishResults: payload.publishResults, latestPlatformResults, postSummary: payload.postSummary }),
    [payload.run, payload.publishResults, latestPlatformResults, payload.postSummary],
  );

  return (
    <>
      <StatusBanner status={payload.run.status} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <RunProgressCard runId={runId} initialRun={payload.run} />

          {payload.run.output_paths && payload.run.output_paths.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Generated Media</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {payload.run.output_paths.map((filePath, i) => {
                  const filename = filePath.split("/").pop() ?? filePath;
                  const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
                  const mediaUrl = buildMediaUrl(filePath, runId);

                  return isVideo ? (
                    <div key={i} className="overflow-hidden rounded-lg border border-white/10">
                      <video src={mediaUrl} controls className="w-full" preload="metadata" />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{filename}</p>
                    </div>
                  ) : (
                    <div key={i} className="overflow-hidden rounded-lg border border-white/10">
                      <img src={mediaUrl} alt={`Generated media ${i + 1}`} className="w-full" />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{filename}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {payload.run.error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <h3 className="mb-1 text-sm font-medium text-red-400">Error</h3>
              <p className="break-all text-sm text-red-300">{payload.run.error}</p>
            </div>
          ) : null}

          {payload.publishResults.length > 0 ? (
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
                {latestPlatformResults.map((result) => {
                  const retryDisabled = payload.run.status === "publishing" || !postPlatforms.includes(result.platform);
                  return (
                    <div
                      key={result.platform}
                      className="flex flex-col gap-3 rounded-md border border-white/5 bg-zinc-800/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
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
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {result.status === "failed" ? (
                          <RunActionsInlineRetry
                            runId={runId}
                            platform={result.platform}
                            disabled={retryDisabled}
                          />
                        ) : null}
                        {result.external_url ? (
                          <a
                            href={result.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-orange-400 hover:text-orange-300"
                          >
                            View →
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {refreshError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              Live detail refresh paused: {refreshError}
            </div>
          ) : null}

          <RunActions
            runId={runId}
            status={payload.run.status}
            templateId={templateId}
            postPlatforms={postPlatforms}
            latestPlatformResults={latestPlatformResults}
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
    </>
  );
}

function RunActionsInlineRetry({
  runId,
  platform,
  disabled,
}: {
  runId: number;
  platform: PlatformType;
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pipeline-runs/${runId}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ platforms: [platform] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to retry ${platformLabel(platform)}`);
        return;
      }
      window.location.reload();
    } catch {
      setError(`Failed to retry ${platformLabel(platform)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleRetry}
        disabled={disabled || loading}
        className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
      >
        {loading ? "Retrying..." : `Retry ${platformLabel(platform)}`}
      </button>
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </div>
  );
}

function getLatestPlatformResults(results: PublishResultRow[]) {
  const latestByPlatform = new Map<PlatformType, PublishResultRow>();
  for (const result of results) latestByPlatform.set(result.platform, result);
  return Array.from(latestByPlatform.values()).sort((a, b) => a.platform.localeCompare(b.platform));
}

function buildTimeline({
  run,
  publishResults,
  latestPlatformResults,
  postSummary,
}: {
  run: RunSnapshot;
  publishResults: PublishResultRow[];
  latestPlatformResults: PublishResultRow[];
  postSummary: PostSummary;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      key: "created",
      time: run.created_at ?? null,
      title: "Run created",
      detail: "Pipeline execution request was recorded.",
      tone: "default",
    },
    {
      key: "started",
      time: run.started_at ?? run.created_at ?? null,
      title: "Generation started",
      detail: "Assets started rendering.",
      tone: "blue",
    },
  ];

  if (run.completed_at) {
    events.push({
      key: "completed",
      time: run.completed_at,
      title: run.status === "failed" ? "Generation failed" : "Generation finished",
      detail:
        run.status === "failed"
          ? run.error || "The pipeline failed during generation or publish handoff."
          : "Output was generated and ready for review.",
      tone: run.status === "failed" ? "red" : "green",
    });
  }

  if (postSummary?.approved_at) {
    events.push({
      key: "approved",
      time: postSummary.approved_at,
      title: "Approved for publishing",
      detail: postSummary.approved_by ? `Approved by ${postSummary.approved_by}.` : "Approved and converted into a post.",
      tone: "green",
    });
  }

  for (const result of publishResults) {
    events.push({
      key: `publish-${result.id}`,
      time: result.published_at,
      title: `${platformLabel(result.platform)} ${result.status === "success" ? successActionLabel(result.platform) : "failed"}`,
      detail: result.status === "success" ? successDetail(result.platform) : result.error || `${platformLabel(result.platform)} failed without a recorded error.`,
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
        detail: `One-click retry will target only failed platforms: ${failedPlatforms.map(platformLabel).join(", ")}.`,
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

function buildMediaUrl(filePath: string, runId: number) {
  const normalized = filePath.replace(/\\/g, "/");
  const pipelineRunsMarker = "/data/pipeline-runs/";
  const mediaMarker = "/data/media/";
  const brandingMarker = "/data/branding/";

  if (normalized.includes(pipelineRunsMarker)) {
    const relative = normalized.split(pipelineRunsMarker)[1];
    return `/api/media/pipeline-runs/${encodeURI(relative)}`;
  }
  if (normalized.includes(mediaMarker)) {
    const relative = normalized.split(mediaMarker)[1];
    return `/api/media/${encodeURI(relative)}`;
  }
  if (normalized.includes(brandingMarker)) {
    const relative = normalized.split("/data/")[1];
    return `/api/media/${encodeURI(relative)}`;
  }
  if (normalized.startsWith("pipeline-runs/") || normalized.startsWith("branding/")) {
    return `/api/media/${encodeURI(normalized)}`;
  }
  if (!normalized.startsWith("/")) {
    return `/api/media/${encodeURI(normalized)}`;
  }

  const filename = normalized.split("/").pop() ?? normalized;
  return `/api/media/pipeline-runs/${runId}/${encodeURIComponent(filename)}`;
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

function platformLabel(platform: PlatformType) {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function successActionLabel(platform: PlatformType) {
  switch (platform) {
    case "youtube":
      return "published";
    default:
      return "published";
  }
}

function successDetail(platform: PlatformType) {
  switch (platform) {
    case "youtube":
      return "Video upload completed successfully.";
    default:
      return "Platform accepted the content.";
  }
}
