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
  const percent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;
  const currentStep = steps.find((step) => step.state === "running");

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
                : currentStep?.description || "The pipeline is working through each generation step."}
          </p>
        </div>

        <div className="min-w-[120px] rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-3 text-left sm:text-right">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Progress</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-100">{percent}%</div>
          <div className="text-xs text-zinc-500">{completedCount}/{steps.length || 0} steps done</div>
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
