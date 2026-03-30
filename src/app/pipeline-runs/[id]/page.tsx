import db from "@/lib/db";
import type { PipelineRunStatus } from "@/lib/types";
import RunActions from "./run-actions";

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
  const stepResults = parseJson<Array<Record<string, unknown>> | null>(
    run.step_results as string | null,
    null
  );
  const outputPaths = parseJson<string[]>(run.output_paths as string | null, []);
  const errorMsg = run.error as string | null;
  const hashtags = Array.isArray(inputParams.hashtags)
    ? (inputParams.hashtags as string[])
    : [];

  // Fetch publish results if published
  let publishResults: Array<Record<string, unknown>> = [];
  if (status === "published") {
    const post_id = run.post_id as number | null;
    if (post_id) {
      publishResults = db
        .prepare("SELECT * FROM publish_results WHERE post_id = ?")
        .all(post_id) as Array<Record<string, unknown>>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <StatusBanner status={status} />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Run #{run.id as number}
          </h1>
          <p className="text-sm text-zinc-400">
            {String(run.template_name)} · {String(run.tenant_name)}
          </p>
        </div>
      </div>

      {/* Input Params */}
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          Input Parameters
        </h2>
        <div className="space-y-2 text-sm">
          {Boolean(inputParams.title) && (
            <ParamRow label="Title" value={String(inputParams.title)} />
          )}
          {Boolean(inputParams.tip) && (
            <ParamRow label="Tip" value={String(inputParams.tip)} />
          )}
          {Boolean(inputParams.category) && (
            <ParamRow label="Category" value={String(inputParams.category)} />
          )}
          {hashtags.length > 0 && (
            <div>
              <span className="text-zinc-500">Hashtags</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {hashtags.map((h: string, i: number) => (
                  <span
                    key={i}
                    className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 border border-white/10"
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

      {/* Step Results */}
      {stepResults && Array.isArray(stepResults) && stepResults.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Pipeline Steps
          </h2>
          <div className="space-y-3">
            {stepResults.map((step: Record<string, unknown>, i: number) => (
              <div
                key={i}
                className="rounded-md border border-white/5 bg-zinc-800/50 p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300">
                    Step {i + 1}
                  </span>
                  {Boolean(step.type) && (
                    <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
                      {String(step.type)}
                    </span>
                  )}
                  {Boolean(step.status) && (
                    <span
                      className={`text-xs ${
                        step.status === "completed"
                          ? "text-emerald-400"
                          : step.status === "failed"
                          ? "text-red-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {String(step.status)}
                    </span>
                  )}
                </div>
                {Boolean(step.output) && (
                  <p className="text-xs text-zinc-400 break-all">
                    {typeof step.output === "string"
                      ? step.output
                      : JSON.stringify(step.output)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated Media Preview */}
      {outputPaths.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Generated Media
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {outputPaths.map((filePath, i) => {
              const filename = filePath.split("/").pop() ?? filePath;
              const isVideo =
                /\.(mp4|webm|mov)$/i.test(filename);
              const mediaUrl = `/api/media/pipeline-runs/${id}/${filename}`;

              return isVideo ? (
                <div key={i} className="overflow-hidden rounded-lg border border-white/10">
                  <video
                    src={mediaUrl}
                    controls
                    className="w-full"
                    preload="metadata"
                  />
                  <p className="px-2 py-1 text-xs text-zinc-500 truncate">
                    {filename}
                  </p>
                </div>
              ) : (
                <div key={i} className="overflow-hidden rounded-lg border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl}
                    alt={`Generated media ${i + 1}`}
                    className="w-full"
                  />
                  <p className="px-2 py-1 text-xs text-zinc-500 truncate">
                    {filename}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Message */}
      {status === "failed" && errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <h3 className="mb-1 text-sm font-medium text-red-400">Error</h3>
          <p className="text-sm text-red-300 break-all">{errorMsg}</p>
        </div>
      )}

      {/* Publish Results */}
      {status === "published" && publishResults.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
          <h2 className="mb-3 text-sm font-medium text-emerald-400">
            Published
          </h2>
          <div className="space-y-2">
            {publishResults.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-300">
                    {r.platform as string}
                  </span>
                  <span
                    className={
                      r.status === "success"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {r.status as string}
                  </span>
                </div>
                {Boolean(r.external_url) && (
                  <a
                    href={String(r.external_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 hover:text-orange-300"
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons (client component) */}
      <RunActions runId={Number(id)} status={status} templateId={run.template_id as number} />
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

/* ---------- Sub-components ---------- */

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label}</span>
      <p className="text-zinc-300">{value}</p>
    </div>
  );
}

function StatusBanner({ status }: { status: PipelineRunStatus }) {
  const config: Record<
    PipelineRunStatus,
    { bg: string; text: string; label: string }
  > = {
    pending: { bg: "bg-zinc-700/50", text: "text-zinc-300", label: "Pending" },
    generating: {
      bg: "bg-blue-500/20",
      text: "text-blue-300",
      label: "Generating...",
    },
    preview: {
      bg: "bg-amber-500/20",
      text: "text-amber-300",
      label: "Ready for Review",
    },
    approved: {
      bg: "bg-green-500/20",
      text: "text-green-300",
      label: "Approved",
    },
    publishing: {
      bg: "bg-blue-500/20",
      text: "text-blue-300",
      label: "Publishing...",
    },
    published: {
      bg: "bg-emerald-500/20",
      text: "text-emerald-300",
      label: "Published",
    },
    failed: { bg: "bg-red-500/20", text: "text-red-300", label: "Failed" },
  };

  const c = config[status] ?? config.pending;

  return (
    <div
      className={`w-full rounded-lg ${c.bg} px-4 py-3 text-center text-sm font-medium ${c.text} ${
        status === "generating" ? "animate-pulse" : ""
      }`}
    >
      {c.label}
    </div>
  );
}
