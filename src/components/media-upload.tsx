"use client";

import { useState } from "react";

export default function MediaUpload({
  tenantId,
  onUploaded,
  accept,
  multiple = false,
  onUploadStateChange,
}: {
  tenantId: string;
  onUploaded: (paths: string[]) => void;
  accept?: string;
  multiple?: boolean;
  onUploadStateChange?: (state: { uploading: boolean; progress: number; fileNames: string[] }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("tenant_id", tenantId);
      form.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/media/upload");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const nextProgress = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        setProgress(nextProgress);
        onUploadStateChange?.({ uploading: true, progress: nextProgress, fileNames: [file.name] });
      };

      xhr.onerror = () => reject(new Error(`Upload failed for ${file.name}`));
      xhr.onload = () => {
        let data: { error?: string; data?: { path?: string } } = {};
        try {
          data = xhr.responseText ? (JSON.parse(xhr.responseText) as typeof data) : {};
        } catch {
          data = {};
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(data.error || `Upload failed for ${file.name}`));
          return;
        }

        if (!data.data?.path) {
          reject(new Error(`Upload finished but no file path was returned for ${file.name}`));
          return;
        }

        resolve(data.data.path);
      };

      xhr.send(form);
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const selectedNames = Array.from(files).map((file) => file.name);
    setUploading(true);
    setProgress(0);
    setFileNames(selectedNames);
    setError(null);
    onUploadStateChange?.({ uploading: true, progress: 0, fileNames: selectedNames });

    try {
      const paths: string[] = [];
      const selectedFiles = Array.from(files);

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        setFileNames([file.name]);
        const uploadedPath = await uploadFile(file);
        paths.push(uploadedPath);

        const completedProgress = Math.round(((index + 1) / selectedFiles.length) * 100);
        setProgress(completedProgress);
        onUploadStateChange?.({ uploading: true, progress: completedProgress, fileNames: [file.name] });
      }

      setProgress(100);
      setUploading(false);
      onUploadStateChange?.({ uploading: false, progress: 100, fileNames: selectedNames });
      onUploaded(paths);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setUploading(false);
      onUploadStateChange?.({ uploading: false, progress: 0, fileNames: selectedNames });
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
      {uploading ? (
        <div className="space-y-2 rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-300">
            <span className="truncate">Uploading {fileNames[0] || "file"}</span>
            <span className="shrink-0 text-orange-300">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
