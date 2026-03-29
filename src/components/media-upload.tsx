"use client";

import { useState } from "react";

export default function MediaUpload({
  tenantId,
  onUploaded,
}: {
  tenantId: string;
  onUploaded: (paths: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append("tenant_id", tenantId);
    Array.from(files).forEach((f) => form.append("files", f));

    const res = await fetch("/api/media/upload", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Upload failed");
      setUploading(false);
      return;
    }
    const data = await res.json();
    onUploaded(data.data.paths);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-zinc-400">Media Upload</label>
      <input
        type="file"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="block w-full text-xs text-zinc-300 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-white"
      />
      {uploading && <p className="text-xs text-zinc-400">Uploading...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
