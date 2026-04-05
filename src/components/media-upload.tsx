"use client";

import { useState } from "react";

export default function MediaUpload({
  tenantId,
  onUploaded,
  accept,
  multiple = false,
}: {
  tenantId: string;
  onUploaded: (paths: string[]) => void;
  accept?: string;
  multiple?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const uploads = Array.from(files).map(async (file) => {
        const form = new FormData();
        form.append("tenant_id", tenantId);
        form.append("file", file);

        const res = await fetch("/api/media/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Upload failed for ${file.name}`);
        }
        return data.data.path as string;
      });

      const paths = await Promise.all(uploads);
      onUploaded(paths);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-zinc-400">Media Upload</label>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="block w-full text-xs text-zinc-300 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-white"
      />
      {uploading && <p className="text-xs text-zinc-400">Uploading...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
