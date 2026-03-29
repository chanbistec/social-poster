"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MediaUpload from "@/components/media-upload";

export default function NewPostPage() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function createPost(status: "draft" | "pending_approval") {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        caption,
        hashtags: [],
        media_paths: media,
        platforms,
        status,
      }),
    });

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

      <div className="space-y-4">
        <div>
          <label className="text-xs text-zinc-400">Tenant ID</label>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="area6"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-400">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            rows={5}
          />
        </div>

        <MediaUpload tenantId={tenantId} onUploaded={setMedia} />

        <div className="flex gap-4 text-xs text-zinc-300">
          {"youtube instagram facebook".split(" ").map((p) => (
            <label key={p} className="flex items-center gap-2">
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
              />
              {p}
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-white"
            onClick={() => createPost("draft")}
          >
            Save Draft
          </button>
          <button
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
            onClick={() => createPost("pending_approval")}
          >
            Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}
