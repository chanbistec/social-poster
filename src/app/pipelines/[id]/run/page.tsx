"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import MediaUpload from "@/components/media-upload";

const CATEGORIES = [
  "sleep",
  "exercise",
  "nutrition",
  "hydration",
  "mental",
  "posture",
  "habits",
  "recovery",
  "breathing",
  "gut-health",
] as const;

const BATCH_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

interface TemplateInfo {
  id: number;
  name: string;
  type: string;
  tenant_id: string;
  steps?: string | null;
  tenant_name?: string | null;
}

interface DraftItem {
  title: string;
  tip: string;
  highlight: string;
  hashtags: string;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getCustomStepConfig(template: TemplateInfo | null, type: string) {
  const steps = parseJson<Array<{ type?: string; config?: Record<string, unknown> }>>(template?.steps, []);
  return steps.find((step) => step.type === type)?.config ?? {};
}

function createEmptyDraft(): DraftItem {
  return {
    title: "",
    tip: "",
    highlight: "",
    hashtags: "",
  };
}

function normalizeDraft(data: unknown): DraftItem {
  const item = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  return {
    title: typeof item.title === "string" ? item.title : "",
    tip: typeof item.tip === "string" ? item.tip : "",
    highlight: typeof item.highlight === "string" ? item.highlight : "",
    hashtags: Array.isArray(item.hashtags)
      ? item.hashtags.filter((tag): tag is string => typeof tag === "string").join(", ")
      : typeof item.hashtags === "string"
        ? item.hashtags
        : "",
  };
}

export default function PipelineRunPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [tip, setTip] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | string>(CATEGORIES[0]);
  const [hashtags, setHashtags] = useState("");
  const [highlight, setHighlight] = useState("");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [drafts, setDrafts] = useState<DraftItem[]>([createEmptyDraft()]);

  const isCustom = template?.type === "custom";
  const isBatchMode = !isCustom && batchSize > 1;
  const uploadConfig = getCustomStepConfig(template, "upload_video");
  const playlistConfig = getCustomStepConfig(template, "playlist_add");
  const privacy = typeof uploadConfig.privacy === "string" ? uploadConfig.privacy : "unlisted";
  const vivaEnabled = Boolean(uploadConfig.viva_engage);
  const vivaGroup = typeof uploadConfig.viva_group === "string" ? uploadConfig.viva_group : null;
  const playlistPrivacy = typeof playlistConfig.privacy === "string" ? playlistConfig.privacy : privacy;

  useEffect(() => {
    fetch(`/api/pipelines/${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setTemplate(res.data);
        else setError("Pipeline template not found");
      })
      .catch(() => setError("Failed to load template"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (isCustom) return;

    setDrafts((current) => {
      const next = Array.from({ length: batchSize }, (_, index) => current[index] ?? createEmptyDraft());
      if (batchSize === 1) {
        const first = next[0] ?? createEmptyDraft();
        setTitle(first.title);
        setTip(first.tip);
        setHighlight(first.highlight);
        setHashtags(first.hashtags);
      }
      return next;
    });
  }, [batchSize, isCustom]);

  useEffect(() => {
    if (isCustom || isBatchMode) return;
    setDrafts([
      {
        title,
        tip,
        highlight,
        hashtags,
      },
    ]);
  }, [title, tip, highlight, hashtags, isBatchMode, isCustom]);

  async function handleGenerateFromCategory() {
    if (isCustom) return;
    if (!String(category).trim()) {
      setError("Choose a category first");
      return;
    }

    setGeneratingDraft(true);
    setError(null);

    try {
      const res = await fetch(`/api/pipelines/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: String(category).trim(), count: batchSize }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate draft");
        return;
      }

      const items = Array.isArray(data?.items)
        ? data.items.map(normalizeDraft)
        : [normalizeDraft(data?.data)];
      const nextDrafts = Array.from({ length: batchSize }, (_, index) => items[index] ?? createEmptyDraft());
      setDrafts(nextDrafts);

      if (batchSize === 1) {
        const first = nextDrafts[0] ?? createEmptyDraft();
        setTitle(first.title);
        setTip(first.tip);
        setHighlight(first.highlight);
        setHashtags(first.hashtags);
      }
    } catch {
      setError("Network error while generating draft");
    } finally {
      setGeneratingDraft(false);
    }
  }

  function updateDraft(index: number, field: keyof DraftItem, value: string) {
    setDrafts((current) => {
      const next = current.map((draft, itemIndex) => (itemIndex === index ? { ...draft, [field]: value } : draft));
      if (batchSize === 1) {
        const first = next[0] ?? createEmptyDraft();
        setTitle(first.title);
        setTip(first.tip);
        setHighlight(first.highlight);
        setHashtags(first.hashtags);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isCustom && !mediaPath) {
      setError("Upload a video before starting this pipeline");
      return;
    }

    const singleDraft = {
      title: title.trim(),
      tip: tip.trim(),
      highlight: highlight.trim(),
      hashtags: hashtags,
    };

    const queuedDrafts = isBatchMode ? drafts : [singleDraft];
    const invalidDraftIndex = queuedDrafts.findIndex((draft) => !draft.title.trim() || !draft.tip.trim());
    if (invalidDraftIndex !== -1) {
      setError(isBatchMode ? `Draft ${invalidDraftIndex + 1} needs both a title and tip` : "Title and tip are required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = isBatchMode
        ? {
            runs: queuedDrafts.map((draft) => ({
              title: draft.title.trim(),
              tip: draft.tip.trim(),
              category: String(category).trim(),
              hashtags: draft.hashtags
                .split(",")
                .map((h) => h.trim())
                .filter(Boolean),
              highlight: draft.highlight.trim() || undefined,
            })),
          }
        : {
            title: singleDraft.title,
            tip: singleDraft.tip,
            category: String(category).trim(),
            hashtags: singleDraft.hashtags
              .split(",")
              .map((h) => h.trim())
              .filter(Boolean),
            highlight: singleDraft.highlight || undefined,
            media_path: mediaPath || undefined,
          };

      const res = await fetch(`/api/pipelines/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start pipeline run");
        setSubmitting(false);
        return;
      }

      const queuedCount = Number(data?.data?.queued_count) || 1;
      const runId = data?.data?.run_id;
      if (runId) {
        const query = queuedCount > 1 ? `?queued=${queuedCount}` : "";
        router.push(`/pipeline-runs/${runId}${query}`);
        return;
      }

      router.push("/pipeline-runs");
    } catch {
      setError("Network error, please try again");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-6 text-zinc-400">
        {error || "Template not found"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {template.name}{" "}
          <span className="ml-1 rounded-full border border-white/10 bg-zinc-800 px-2 py-0.5 text-xs">
            {template.type}
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                {isCustom ? "Playlist / Series" : "Category"} {isCustom && <span className="text-red-400">*</span>}
              </label>
              {isCustom ? (
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. HR Masterclass"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!isCustom ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">Batch size</label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {BATCH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} {option === 1 ? "run" : "runs"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Batch mode is available for non-custom templates only.
                </p>
              </div>
            ) : null}
          </div>

          {!isCustom ? (
            <div className="rounded-lg border border-orange-500/20 bg-zinc-950/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-medium text-orange-100">Generate from category</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Use Gemini to create {batchSize === 1 ? "a draft" : `${batchSize} distinct drafts`} for this category, then tweak each card before queueing runs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateFromCategory}
                  disabled={generatingDraft}
                  className="inline-flex items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingDraft ? "Generating..." : batchSize === 1 ? "Generate draft" : "Generate drafts"}
                </button>
              </div>
            </div>
          ) : null}

          {isCustom ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Video Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Leadership Lesson 01"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  required
                  rows={4}
                  placeholder="Write the YouTube description or lesson summary..."
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
                />
                <p className="mt-1 text-right text-xs text-zinc-500">{tip.length} characters</p>
              </div>

              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium text-orange-100">Academy upload preflight</h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Starting this run will validate the uploaded file and refresh the connected YouTube token before the background upload begins.
                    </p>
                  </div>
                  <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-200">
                    {template?.tenant_name || template?.tenant_id}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500">YouTube privacy</div>
                    <div className="mt-1 text-sm text-zinc-200">{privacy}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500">Playlist handling</div>
                    <div className="mt-1 text-sm text-zinc-200">Auto-add / create · {playlistPrivacy}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500">Viva Engage</div>
                    <div className="mt-1 text-sm text-zinc-200">
                      {vivaEnabled ? `Enabled${vivaGroup ? ` · group ${vivaGroup}` : ""}` : "Disabled"}
                    </div>
                  </div>
                </div>
              </div>

              {template.tenant_id ? (
                <div className="space-y-2 rounded-lg border border-white/10 bg-zinc-950/40 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Academy Video <span className="text-red-400">*</span>
                    </label>
                    <MediaUpload
                      tenantId={template.tenant_id}
                      accept="video/mp4,video/quicktime,video/webm"
                      onUploaded={(paths) => setMediaPath(paths[0] ?? null)}
                    />
                  </div>
                  <p className="text-xs text-zinc-500">
                    Upload a finished MP4/MOV/WebM file. The pipeline will publish it to YouTube and place it into the selected playlist.
                  </p>
                  {mediaPath ? (
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                      Ready: {mediaPath}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : isBatchMode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-zinc-200">Draft queue</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Edit each card before queuing {batchSize} runs.
                  </p>
                </div>
                <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">
                  {batchSize} items
                </span>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {drafts.map((draft, index) => (
                  <div key={index} className="rounded-lg border border-white/10 bg-zinc-950/60 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium text-zinc-100">Draft {index + 1}</h3>
                      <span className="text-xs text-zinc-500">{draft.tip.length} chars</span>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Title
                      </label>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => updateDraft(index, "title", e.target.value)}
                        placeholder="e.g. Morning Hydration Tip"
                        className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Tip / Content
                      </label>
                      <textarea
                        value={draft.tip}
                        onChange={(e) => updateDraft(index, "tip", e.target.value)}
                        rows={4}
                        placeholder="Write the main content or tip here..."
                        className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                          Highlight
                        </label>
                        <input
                          type="text"
                          value={draft.highlight}
                          onChange={(e) => updateDraft(index, "highlight", e.target.value)}
                          placeholder="Word to emphasize"
                          className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                          Hashtags
                        </label>
                        <input
                          type="text"
                          value={draft.hashtags}
                          onChange={(e) => updateDraft(index, "hashtags", e.target.value)}
                          placeholder="health, wellness, tips"
                          className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Morning Hydration Tip"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Tip / Content <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  required
                  rows={4}
                  placeholder="Write the main content or tip here..."
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
                />
                <p className="mt-1 text-right text-xs text-zinc-500">{tip.length} characters</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">Hashtags</label>
                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="health, wellness, tips (comma-separated)"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Highlight Word <span className="text-xs text-zinc-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={highlight}
                  onChange={(e) => setHighlight(e.target.value)}
                  placeholder="Word to emphasize in visuals"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {submitting ? (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
            <p className="text-sm font-medium text-orange-300">
              {isCustom ? "Starting upload pipeline..." : isBatchMode ? `Queueing ${batchSize} pipeline runs...` : "Starting pipeline run..."}
            </p>
            <p className="mt-1 text-xs text-orange-200/80">You’ll be redirected to the live progress page in a moment.</p>
          </div>
        ) : (
          <button
            type="submit"
            disabled={
              generatingDraft ||
              !String(category).trim() ||
              (isCustom ? !title.trim() || !tip.trim() || !mediaPath : isBatchMode ? false : !title.trim() || !tip.trim())
            }
            className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isCustom ? "Upload to Academy" : isBatchMode ? `Queue ${batchSize} Runs` : "Generate Content"}
          </button>
        )}
      </form>
    </div>
  );
}
