import db from "@/lib/db";
import type { PipelineRunStatus, PlatformType } from "@/lib/types";
import RunLiveDetails from "./run-live-details";

type PublishResultRow = {
  id: number;
  platform: string;
  status: string;
  external_url: string | null;
  error: string | null;
  published_at: string | null;
};

type PostSummary = {
  approved_at: string | null;
  approved_by: string | null;
} | null;

type PostPlatformRow = {
  platforms: string;
} | null;

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

  const postSummary = run.post_id
    ? ((db.prepare("SELECT approved_at, approved_by FROM posts WHERE id = ?").get(run.post_id) as {
        approved_at: string | null;
        approved_by: string | null;
      } | undefined) ?? null)
    : null;

  const postPlatforms = run.post_id
    ? parseJson<PlatformType[]>((db.prepare("SELECT platforms FROM posts WHERE id = ?").get(run.post_id) as PostPlatformRow | undefined)?.platforms, [])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Run #{run.id as number}</h1>
          <p className="text-sm text-zinc-400">
            {String(run.template_name)} · {String(run.tenant_name)}
          </p>
        </div>
      </div>

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
          {Boolean(inputParams.highlight) && <ParamRow label="Highlight" value={String(inputParams.highlight)} />}
          {Boolean(inputParams.mediaPath) && <ParamRow label="Academy video" value={String(inputParams.mediaPath)} />}
        </div>
      </div>

      <RunLiveDetails
        runId={Number(id)}
        templateId={run.template_id as number}
        initialRun={{
          id: Number(run.id),
          template_id: run.template_id as number,
          status,
          step_results: stepResults,
          output_paths: outputPaths,
          error: errorMsg,
          completed_at: (run.completed_at as string | null) ?? null,
          updated_at: (run.updated_at as string | null) ?? null,
          created_at: (run.created_at as string | null) ?? null,
          started_at: (run.started_at as string | null) ?? null,
          post_id: (run.post_id as number | null) ?? null,
        }}
        initialPublishResults={publishResults}
        initialPostSummary={postSummary}
        postPlatforms={postPlatforms}
      />

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
    </div>
  );
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

