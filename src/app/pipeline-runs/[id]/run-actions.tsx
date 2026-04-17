"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PipelineRunStatus } from "@/lib/types";

interface RunActionsProps {
  runId: number;
  status: PipelineRunStatus;
  templateId: number;
  hasFailedPlatforms?: boolean;
}

export default function RunActions({ runId, status, templateId, hasFailedPlatforms = false }: RunActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "approve" | "publish" | "retry") {
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
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Failed to ${action}`);
        setLoading(null);
        return;
      }

      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(null);
    }
  }

  if (status === "pending" || status === "generating" || status === "publishing") {
    return null;
  }

  const publishLabel = hasFailedPlatforms ? "Retry failed platforms" : status === "published" || status === "failed" ? "Republish all platforms" : "Publish";
  const publishBusyLabel = hasFailedPlatforms ? "Retrying failed platforms..." : status === "published" || status === "failed" ? "Republishing..." : "Publishing...";

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

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
            disabled={loading !== null}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
          >
            {loading === "publish" ? publishBusyLabel : publishLabel}
          </button>
        )}

        {(status === "published" || status === "failed") && (
          <>
            <button
              onClick={() => handleAction("publish")}
              disabled={loading !== null}
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
