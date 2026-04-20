"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PipelineRunStatus, PlatformType } from "@/lib/types";

interface PlatformResultSummary {
  platform: PlatformType;
  status: "success" | "failed";
}

interface RunActionsProps {
  runId: number;
  status: PipelineRunStatus;
  templateId: number;
  postPlatforms: PlatformType[];
  latestPlatformResults: PlatformResultSummary[];
}

export default function RunActions({
  runId,
  status,
  templateId,
  postPlatforms,
  latestPlatformResults,
}: RunActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformType[]>(() =>
    getDefaultPlatforms(status, postPlatforms, latestPlatformResults),
  );

  const failedPlatforms = useMemo(
    () => latestPlatformResults.filter((result) => result.status === "failed").map((result) => result.platform),
    [latestPlatformResults],
  );
  const hasFailedPlatforms = failedPlatforms.length > 0;

  useEffect(() => {
    setSelectedPlatforms(getDefaultPlatforms(status, postPlatforms, latestPlatformResults));
  }, [latestPlatformResults, postPlatforms, status]);

  async function handleAction(action: "approve" | "publish" | "retry", platforms?: PlatformType[]) {
    setLoading(action);
    setError(null);

    try {
      if (action === "retry") {
        const params = new URLSearchParams(searchParams.toString());
        params.set("from_run", String(runId));
        router.push(`/pipelines/${templateId}/run?${params.toString()}`);
        return;
      }

      const res = await fetch(`/api/pipeline-runs/${runId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: action === "publish" ? JSON.stringify({ platforms: platforms ?? selectedPlatforms }) : undefined,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Failed to ${action}`);
        setLoading(null);
        return;
      }

      router.refresh();
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(null);
    }
  }

  if (status === "pending" || status === "generating" || status === "publishing") {
    return null;
  }

  const publishDisabled = loading !== null || selectedPlatforms.length === 0;
  const isRepublish = status === "published" || status === "failed";
  const publishLabel = hasFailedPlatforms
    ? "Publish selected retry targets"
    : isRepublish
      ? "Republish selected platforms"
      : "Publish selected platforms";
  const publishBusyLabel = hasFailedPlatforms
    ? "Retrying selected platforms..."
    : isRepublish
      ? "Republishing selected platforms..."
      : "Publishing selected platforms...";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {(status === "approved" || status === "published" || status === "failed") && postPlatforms.length > 0 ? (
        <div className="rounded-xl border border-orange-500/20 bg-zinc-950/80 p-4 shadow-sm shadow-black/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Publish targets</h3>
              <p className="text-xs text-zinc-500">
                {hasFailedPlatforms
                  ? "Failed platforms are preselected. You can keep them or choose a different subset."
                  : "Choose which configured platforms to publish to for this run."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlatforms(getDefaultPlatforms(status, postPlatforms, latestPlatformResults))}
              disabled={loading !== null}
              className="inline-flex self-start rounded-full border border-white/10 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-orange-400/40 hover:text-orange-200 disabled:opacity-50"
            >
              Reset default
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {postPlatforms.map((platform) => {
              const checked = selectedPlatforms.includes(platform);
              const failed = failedPlatforms.includes(platform);
              return (
                <label
                  key={platform}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition-colors ${
                    checked
                      ? "border-orange-500/50 bg-orange-500/15 text-orange-100"
                      : "border-white/10 bg-zinc-900 text-zinc-300 hover:border-orange-500/30 hover:text-zinc-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedPlatforms((current) => togglePlatform(current, platform))}
                    disabled={loading !== null}
                    className="h-4 w-4 rounded border-white/20 bg-zinc-950 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="font-medium capitalize">{platformLabel(platform)}</span>
                  {failed ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                      failed
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-zinc-500">
            {selectedPlatforms.length > 0
              ? `${selectedPlatforms.length} platform${selectedPlatforms.length === 1 ? "" : "s"} selected`
              : "Select at least one configured platform to publish."}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {status === "preview" && (
          <>
            <button
              onClick={() => handleAction("approve")}
              disabled={loading !== null}
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
            >
              {loading === "approve" ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => handleAction("retry")}
              disabled={loading !== null}
              className="rounded-lg border border-white/10 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Regenerate
            </button>
          </>
        )}

        {status === "approved" && (
          <button
            onClick={() => handleAction("publish")}
            disabled={publishDisabled}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
          >
            {loading === "publish" ? publishBusyLabel : publishLabel}
          </button>
        )}

        {(status === "published" || status === "failed") && (
          <>
            <button
              onClick={() => handleAction("publish")}
              disabled={publishDisabled}
              className="rounded-lg border border-orange-500/50 bg-orange-600/20 px-5 py-2.5 text-sm font-medium text-orange-300 transition-colors hover:bg-orange-600 hover:text-white disabled:opacity-50"
            >
              {loading === "publish" ? publishBusyLabel : publishLabel}
            </button>
            <button
              onClick={() => handleAction("retry")}
              disabled={loading !== null}
              className="rounded-lg border border-white/10 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Regenerate New
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function getDefaultPlatforms(
  status: PipelineRunStatus,
  postPlatforms: PlatformType[],
  latestPlatformResults: PlatformResultSummary[],
) {
  if (status === "approved") return [...postPlatforms];

  if (status === "published" || status === "failed") {
    const failedPlatforms = latestPlatformResults
      .filter((result) => result.status === "failed")
      .map((result) => result.platform)
      .filter((platform): platform is PlatformType => postPlatforms.includes(platform));

    return failedPlatforms.length > 0 ? failedPlatforms : [...postPlatforms];
  }

  return [...postPlatforms];
}

function togglePlatform(current: PlatformType[], platform: PlatformType) {
  return current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform];
}

function platformLabel(platform: PlatformType) {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}
