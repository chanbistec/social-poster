"use client";

import { useEffect, useMemo, useState } from "react";
import type { PipelineRunStatus } from "@/lib/types";

type StepState = "pending" | "running" | "completed" | "failed";

type StepItem = {
  key: string;
  label: string;
  description?: string;
  state: StepState;
  summary?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
};

type RunSnapshot = {
  id: number;
  status: PipelineRunStatus;
  step_results: unknown;
  output_paths: string[] | null;
  error: string | null;
  completed_at: string | null;
  updated_at?: string | null;
};

const ACTIVE_STATUSES: PipelineRunStatus[] = ["pending", "generating", "publishing"];

export default function RunProgressCard({
  runId,
  initialRun,
}: {
  runId: number;
  initialRun: RunSnapshot;
}) {
  const [run, setRun] = useState<RunSnapshot>(initialRun);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(run.status)) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run.status]);

  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(run.status)) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/pipeline-runs/${runId}`, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || "Failed to refresh run progress");
        }
        if (!cancelled) {
          setRun(payload.data as RunSnapshot);
          setRefreshError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshError(error instanceof Error ? error.message : "Failed to refresh run progress");
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [run.status, runId]);

  const steps = useMemo(() => normalizeStepResults(run.step_results), [run.step_results]);
  const completedCount = steps.filter((step) => step.state === "completed").length;
  const currentStep = steps.find((step) => step.state === "running");
  const partialStepPercent = currentStep ? extractPercent(currentStep.summary) : null;
  const percent = steps.length
    ? Math.round((((completedCount + ((partialStepPercent ?? 0) / 100)) / steps.length) * 100))
    : 0;
  const currentStage = currentStep?.summary || currentStep?.description || "Waiting for the pipeline worker to start.";
  const activeElapsedAt = currentStep?.startedAt ?? run.completed_at ?? undefined;
  const lastUpdatedAt = run.updated_at ?? currentStep?.completedAt ?? currentStep?.startedAt ?? undefined;

  return (
    <div className="rounded-2xl border border-orange-500/20 bg-zinc-950/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
            <span className="h-2 w-2 rounded-full bg-orange-400" />
            Live pipeline progress
          </div>
          <h2 className="mt-3 text-lg font-semibold text-zinc-100">{statusHeadline(run.status, currentStep?.label)}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {run.status === "preview"
              ? "Everything is ready for review."
              : run.status === "failed"
                ? run.error || "The run failed before finishing all steps."
                : currentStage}
          </p>
         <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            <LiveMetaPill label="Stage" value={currentStep?.label || statusLabel(run.status)} />
            <LiveMetaPill label={run.status === "failed" || run.completed_at ? "Completed" : "Elapsed"} value={formatElapsed(activeElapsedAt, now)} />
            <LiveMetaPill label="Last update" value={formatRelativeTime(lastUpdatedAt, now)} />
            {partialStepPercent !== null ? <LiveMetaPill label="Current step" value={`${partialStepPercent}%`} /> : null}
          </div>
        </div>

        <div className="min-w-[120px] rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-3 text-left sm:text-right">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Progress</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-100">{percent}%</div>
          <div className="text-xs text-zinc-500">
            {completedCount}/{steps.length || 0} steps done{partialStepPercent !== null ? ` · ${currentStep?.label || "Current step"} ${partialStepPercent}%` : ""}
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-900">
        <div
          className={`h-full rounded-full transition-all duration-500 ${run.status === "failed" ? "bg-red-500" : "bg-gradient-to-r from-orange-500 to-amber-400"}`}
          style={{ width: `${Math.max(percent, run.status === "failed" ? percent || 15 : 8)}%` }}
        />
      </div>

      {refreshError ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Auto-refresh paused: {refreshError}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <div key={step.key} className="rounded-xl border border-white/8 bg-zinc-900/70 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${badgeTone(step.state)}`}>
                  {step.state === "completed" ? "✓" : step.state === "failed" ? "!" : index + 1}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-zinc-100">{step.label}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pillTone(step.state)}`}>
                      {labelForState(step.state)}
                    </span>
                  </div>
                  {step.description ? <p className="mt-1 text-sm text-zinc-400">{step.description}</p> : null}
                  {step.summary ? <p className="mt-2 text-sm text-zinc-300">{step.summary}</p> : null}
                  {step.error ? <p className="mt-2 text-sm text-red-300">{step.error}</p> : null}
                  <StepArtifacts step={step} />
                </div>
              </div>

              <div className="pl-11 text-xs text-zinc-500 sm:pl-0 sm:text-right">
                {step.state === "running"
                  ? `Started ${formatDate(step.startedAt)}`
                  : step.completedAt
                    ? formatDate(step.completedAt)
                    : step.startedAt
                      ? `Started ${formatDate(step.startedAt)}`
                      : "Waiting"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeStepResults(stepResults: unknown): StepItem[] {
  if (!stepResults || typeof stepResults !== "object") return [];

  return Object.entries(stepResults as Record<string, unknown>).map(([key, raw]) => {
    if (raw && typeof raw === "object" && "state" in (raw as Record<string, unknown>)) {
      const step = raw as Record<string, unknown>;
      return {
        key,
        label: typeof step.label === "string" ? step.label : titleCase(key),
        description: typeof step.description === "string" ? step.description : undefined,
        state: toStepState(step.state),
        summary: typeof step.summary === "string" ? step.summary : undefined,
        error: typeof step.error === "string" ? step.error : undefined,
        startedAt: typeof step.startedAt === "string" ? step.startedAt : undefined,
        completedAt: typeof step.completedAt === "string" ? step.completedAt : undefined,
        result: step.result,
      } satisfies StepItem;
    }

    return {
      key,
      label: titleCase(key),
      state: "completed",
      summary: typeof raw === "string" ? raw : "Completed",
      result: raw,
    } satisfies StepItem;
  });
}

function toStepState(value: unknown): StepState {
  if (value === "pending" || value === "running" || value === "completed" || value === "failed") {
    return value;
  }
  return "pending";
}

function labelForState(state: StepState) {
  switch (state) {
    case "running":
      return "In progress";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}

function statusHeadline(status: PipelineRunStatus, currentStep?: string) {
  switch (status) {
    case "preview":
      return "Pipeline run complete";
    case "failed":
      return "Pipeline run failed";
    case "publishing":
      return "Publishing approved content";
    case "approved":
      return "Run approved";
    case "published":
      return "Run published";
    default:
      return currentStep ? `${currentStep} in progress` : "Starting pipeline run";
  }
}

function LiveMetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-zinc-900/80 px-2.5 py-1">
      <span className="text-zinc-500">{label}:</span> {value}
    </span>
  );
}

function extractPercent(summary?: string) {
  if (!summary) return null;
  const match = summary.match(/(\d{1,3})%/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

function statusLabel(status: PipelineRunStatus) {
  switch (status) {
    case "pending":
      return "Queued";
    case "generating":
      return "Generating";
    case "publishing":
      return "Publishing";
    case "preview":
      return "Ready for review";
    case "approved":
      return "Approved";
    case "published":
      return "Published";
    case "failed":
      return "Failed";
    default:
      return titleCase(String(status));
  }
}

function formatElapsed(value: string | undefined, now: number) {
  if (!value) return "Just now";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Just now";

  const totalSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatRelativeTime(value: string | undefined, now: number) {
  if (!value) return "Waiting";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return formatDate(value);

  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 5) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  return formatDate(value);
}

function badgeTone(state: StepState) {
  switch (state) {
    case "running":
      return "border-orange-500/40 bg-orange-500/15 text-orange-200";
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
    case "failed":
      return "border-red-500/40 bg-red-500/15 text-red-200";
    default:
      return "border-white/10 bg-zinc-950 text-zinc-400";
  }
}

function pillTone(state: StepState) {
  switch (state) {
    case "running":
      return "border border-orange-500/20 bg-orange-500/10 text-orange-200";
    case "completed":
      return "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    case "failed":
      return "border border-red-500/20 bg-red-500/10 text-red-200";
    default:
      return "border border-white/10 bg-zinc-950 text-zinc-400";
  }
}

function titleCase(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ").replace(/^./, (char) => char.toUpperCase()).trim();
}

function formatDate(value?: string) {
  if (!value) return "Waiting";
  try {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return value;
  }
}

function StepArtifacts({ step }: { step: StepItem }) {
  const links = getStepLinks(step);
  const facts = getStepFacts(step);

  if (links.length === 0 && facts.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3">
      {facts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {facts.map((fact) => (
            <span
              key={`${step.key}-${fact.label}-${fact.value}`}
              className="rounded-full border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300"
            >
              <span className="text-zinc-500">{fact.label}:</span> {fact.value}
            </span>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={`${step.key}-${link.label}-${link.href}`}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-200 transition-colors hover:border-orange-400/40 hover:bg-orange-500/15"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getStepLinks(step: StepItem): Array<{ label: string; href: string }> {
  const result = asRecord(step.result);
  if (!result) return [];

  const links: Array<{ label: string; href: string }> = [];
  addLink(links, "Open video", result.external_url);
  addLink(links, "Open playlist", result.playlistUrl);

  return links;
}

function getStepFacts(step: StepItem): Array<{ label: string; value: string }> {
  const result = asRecord(step.result);
  if (!result) return [];

  const facts: Array<{ label: string; value: string }> = [];

  addFact(facts, "Video ID", result.external_id);
  addFact(facts, "Playlist ID", result.playlistId);
  addFact(facts, "Playlist item", result.itemId);
  addFact(facts, "Message ID", result.externalId);
  addFact(facts, "Duration", formatDuration(result.duration));
  addFact(facts, "Scenes", formatCount(result.imagePaths, "scene"));
  addFact(facts, "Images", formatCount(result.imagePaths, "image"));
  addFact(facts, "Prompts", formatCount(result.prompts, "prompt"));
  addFact(facts, "Renderer", typeof result.source === "string" ? result.source : undefined);
  addFact(facts, "Audio", fileName(result.wavPath));
  addFact(facts, "Video file", fileName(result.videoPath));
  addFact(facts, "Image file", fileName(result.imagePath));

  if (typeof result.output === "string" && result.output.trim()) {
    const firstLine = result.output.trim().split(/\r?\n/)[0];
    addFact(facts, "Output", truncate(firstLine, 80));
  }

  return dedupeFacts(facts);
}

function addLink(target: Array<{ label: string; href: string }>, label: string, href: unknown) {
  if (typeof href !== "string" || !href.trim()) return;
  target.push({ label, href: href.trim() });
}

function addFact(target: Array<{ label: string; value: string }>, label: string, value: string | undefined) {
  if (!value) return;
  target.push({ label, value });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function fileName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

function formatDuration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  return `${value.toFixed(1)}s`;
}

function formatCount(value: unknown, noun: string) {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return `${value.length} ${noun}${value.length === 1 ? "" : "s"}`;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function dedupeFacts(facts: Array<{ label: string; value: string }>) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.label}:${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
