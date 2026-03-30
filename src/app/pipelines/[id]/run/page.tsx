"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

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
}

export default function PipelineRunPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [tip, setTip] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[0]);
  const [hashtags, setHashtags] = useState("");
  const [highlight, setHighlight] = useState("");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tip.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/pipelines/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          tip: tip.trim(),
          category,
          hashtags: hashtags
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean),
          highlight: highlight.trim() || undefined,
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Run Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {template.name}{" "}
          <span className="ml-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs border border-white/10">
            {template.type}
          </span>
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-5 space-y-4">
          {/* Title */}
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

          {/* Tip / Content */}
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
            <p className="mt-1 text-right text-xs text-zinc-500">
              {tip.length} characters
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Category
            </label>
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
          </div>

          {/* Hashtags */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Hashtags
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="health, wellness, tips (comma-separated)"
              className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Highlight Word */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Highlight Word{" "}
              <span className="text-xs text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              placeholder="Word to emphasize in visuals"
              className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        {submitting ? (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
            <p className="text-sm font-medium text-orange-300">
              Generating... This may take 1-2 minutes
            </p>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!title.trim() || !tip.trim()}
            className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            Generate Content
          </button>
        )}
      </form>
    </div>
  );
}
