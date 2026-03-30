"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineRunStatus } from "@/lib/types";

interface RunActionsProps {
  runId: number;
  status: PipelineRunStatus;
  templateId: number;
}

export default function RunActions({ runId, status, templateId }: RunActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "approve" | "publish" | "retry") {
    setLoading(action);
    setError(null);

    try {
      if (action === "retry") {
        // Redirect back to the run form for the template
        router.push(`/pipelines/${templateId}/run`);
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

      // Refresh the page to show updated status
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(null);
    }
  }

  // No actions for certain states
  if (
    status === "pending" ||
    status === "generating" ||
    status === "publishing"
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Preview → Approve + Regenerate */}
        {status === "preview" && (
          <>
            <button
              onClick={() => handleAction("approve")}
              disabled={loading !== null}
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
            >
              {loading === "approve" ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => handleAction("retry")}
              disabled={loading !== null}
              className="rounded-lg border border-white/10 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              Regenerate
            </button>
          </>
        )}

        {/* Approved → Publish */}
        {status === "approved" && (
          <button
            onClick={() => handleAction("publish")}
            disabled={loading !== null}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
          >
            {loading === "publish" ? "Publishing..." : "Publish"}
          </button>
        )}

        {/* Failed → Retry */}
        {status === "failed" && (
          <button
            onClick={() => handleAction("retry")}
            disabled={loading !== null}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
