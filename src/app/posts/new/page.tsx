"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import MediaUpload from "@/components/media-upload";

interface TenantOption {
  id: string;
  name: string;
}

interface TenantDetail {
  id: string;
  name: string;
  platforms: { type: string }[];
}

export default function NewPostPage() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch tenants on mount
  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => r.json())
      .then((d) => setTenants(d.data || []))
      .catch(() => {});
  }, []);

  // Fetch tenant platforms when tenant changes
  useEffect(() => {
    if (!tenantId) {
      setAvailablePlatforms([]);
      setPlatforms([]);
      return;
    }
    fetch(`/api/tenants/${tenantId}`)
      .then((r) => r.json())
      .then((d) => {
        const detail = d.data as TenantDetail;
        const types = (detail?.platforms || []).map((p) => p.type);
        setAvailablePlatforms(types);
        // Auto-select all configured platforms
        setPlatforms(types);
      })
      .catch(() => {
        setAvailablePlatforms([]);
      });
  }, [tenantId]);

  async function createPost(status: "draft" | "pending_approval") {
    setError(null);
    setLoading(true);

    const hashtagList = hashtags
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        caption,
        hashtags: hashtagList,
        media_paths: media,
        platforms,
        status,
        scheduled_at: scheduledAt || undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create post");
      return;
    }

    const data = await res.json();
    router.push(`/posts/${data.data.id}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Post</h1>
        <p className="text-sm text-zinc-400">Compose and schedule content</p>
      </div>

      <div className="space-y-5">
        {/* Tenant selector */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Tenant
          </label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Caption */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-400">
              Caption
            </label>
            <span className="text-[11px] text-zinc-500">
              {caption.length} chars
            </span>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            rows={5}
            placeholder="Write your post caption…"
          />
        </div>

        {/* Hashtags */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Hashtags
          </label>
          <textarea
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            rows={2}
            placeholder="#marketing, #launch, #product"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Comma separated
          </p>
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Schedule (optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </div>

        {/* Media upload */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Media
          </label>
          <MediaUpload tenantId={tenantId} onUploaded={setMedia} />
        </div>

        {/* Platforms */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Platforms
          </label>
          {!tenantId ? (
            <p className="text-xs text-zinc-500">
              Select a tenant to see available platforms
            </p>
          ) : availablePlatforms.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No platforms configured for this tenant
            </p>
          ) : (
            <div className="flex gap-4">
              {availablePlatforms.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={platforms.includes(p)}
                    onChange={(e) => {
                      setPlatforms((prev) =>
                        e.target.checked
                          ? [...prev, p]
                          : prev.filter((x) => x !== p)
                      );
                    }}
                    className="rounded border-zinc-600 accent-orange-500"
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 border border-white/10 disabled:opacity-50"
            onClick={() => createPost("draft")}
            disabled={loading}
          >
            Save Draft
          </button>
          <button
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-50"
            onClick={() => createPost("pending_approval")}
            disabled={loading}
          >
            Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}
