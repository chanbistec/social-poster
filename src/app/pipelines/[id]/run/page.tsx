"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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

interface TemplateInfo {
  id: number;
  name: string;
  type: string;
  tenant_id: string;
  steps?: string | null;
  tenant_name?: string | null;
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

type PreviousRunInput = {
  title?: string;
  tip?: string;
  category?: string;
  hashtags?: string[];
  highlight?: string;
  mediaPath?: string;
};

export default function PipelineRunPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;

  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [tip, setTip] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | string>(CATEGORIES[0]);
  const [hashtags, setHashtags] = useState("");
  const [highlight, setHighlight] = useState("");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [prefillLoaded, setPrefillLoaded] = useState(false);

  const fromRunId = useMemo(() => searchParams.get("from_run"), [searchParams]);

  const isCustom = template?.type === "custom";
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
    if (!fromRunId) {
      setPrefillLoaded(true);
      return;
    }

    let cancelled = false;

    fetch(`/api/pipeline-runs/${fromRunId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const input = (res.data?.input_params || {}) as PreviousRunInput;
        setTitle(typeof input.title === "string" ? input.title : "");
        setTip(typeof input.tip === "string" ? input.tip : "");
        setCategory(typeof input.category === "string" && input.category.trim() ? input.category : CATEGORIES[0]);
        setHashtags(Array.isArray(input.hashtags) ? input.hashtags.join(", ") : "");
        setHighlight(typeof input.highlight === "string" ? input.highlight : "");
        setMediaPath(typeof input.mediaPath === "string" ? input.mediaPath : null);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to preload the previous run");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPrefillLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fromRunId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tip.trim()) return;
    if (isCustom && uploadingMedia) {
      setError("Wait for the academy video upload to finish before starting the pipeline");
      return;
    }
    if (isCustom && !mediaPath) {
      setError("Upload a video before starting this pipeline");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/pipelines/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          tip: tip.trim(),
          category: category.trim(),
          hashtags: hashtags
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean),
          highlight: highlight.trim() || undefined,
          media_path: mediaPath || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start pipeline run");
        setSubmitting(false);
        return;
      }

      router.push(`/pipeline-runs/${data.data.run_id}`);
    } catch {
      setError("Network error — please try again");
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {template.name}{" "}
          <span className="ml-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs border border-white/10">
            {template.type}
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              {isCustom ? "Video Title" : "Title"} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={isCustom ? "e.g. Leadership Lesson 01" : "e.g. Morning Hydration Tip"}
              className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              {isCustom ? "Description" : "Tip / Content"} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              required
              rows={4}
              placeholder={isCustom ? "Write the YouTube description or lesson summary..." : "Write the main content or tip here..."}
              className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
            />
            <p className="mt-1 text-right text-xs text-zinc-500">{tip.length} characters</p>
          </div>

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

          {!isCustom && (
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
          )}

          {isCustom ? (
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
          ) : null}

          {isCustom && template.tenant_id ? (
            <div className="space-y-2 rounded-lg border border-white/10 bg-zinc-950/40 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Academy Video <span className="text-red-400">*</span>
                </label>
                <MediaUpload
                  tenantId={template.tenant_id}
                  accept="video/mp4,video/quicktime,video/webm"
                  onUploadStateChange={({ uploading, progress, fileNames }) => {
                    setUploadingMedia(uploading);
                    setUploadProgress(progress);
                    setUploadFileName(fileNames[0] ?? null);
                    if (uploading) {
                      setMediaPath(null);
                    }
                  }}
                  onUploaded={(paths) => {
                    setMediaPath(paths[0] ?? null);
                    setUploadingMedia(false);
                    setUploadProgress(100);
                  }}
                />
              </div>
              <p className="text-xs text-zinc-500">
                Upload a finished MP4/MOV/WebM file. The pipeline will publish it to YouTube and place it into the selected playlist.
              </p>
              {uploadingMedia ? (
                <div className="rounded-md border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
                  Upload in progress{uploadFileName ? `: ${uploadFileName}` : ""} ({uploadProgress}%). You can start the pipeline as soon as the upload completes.
                </div>
              ) : null}
              {fromRunId && !prefillLoaded ? (
                <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                  Loading previous run details...
                </div>
              ) : null}
              {mediaPath ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    Ready: {mediaPath}
                  </div>
                  {fromRunId ? (
                    <p className="text-[11px] text-zinc-500">
                      Reusing the previous academy upload until you replace it with a new file.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
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
              {isCustom ? "Starting upload pipeline..." : "Starting pipeline run..."}
            </p>
            <p className="mt-1 text-xs text-orange-200/80">You’ll be redirected to the live progress page in a moment.</p>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!title.trim() || !tip.trim() || !String(category).trim() || (isCustom && (!mediaPath || uploadingMedia))}
            className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isCustom ? "Upload to Academy" : "Generate Content"}
          </button>
        )}
      </form>
    </div>
  );
}
