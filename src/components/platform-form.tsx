"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformType } from "@/lib/types";

const PLATFORM_TYPES: { value: PlatformType; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

interface PlatformFormProps {
  tenantId: string;
  /** If provided, we're editing an existing platform */
  editId?: number;
  defaultType?: PlatformType;
  defaultCredentials?: string;
  defaultConfig?: string;
  onClose: () => void;
}

export default function PlatformForm({
  tenantId,
  editId,
  defaultType,
  defaultCredentials = "{}",
  defaultConfig = "{}",
  onClose,
}: PlatformFormProps) {
  const router = useRouter();
  const [type, setType] = useState<PlatformType>(defaultType ?? "youtube");
  const [credentials, setCredentials] = useState(defaultCredentials);
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = editId !== undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate JSON
    let parsedCreds: Record<string, unknown>;
    let parsedConfig: Record<string, unknown>;
    try {
      parsedCreds = JSON.parse(credentials);
    } catch {
      setError("Credentials must be valid JSON");
      return;
    }
    try {
      parsedConfig = JSON.parse(config);
    } catch {
      setError("Config must be valid JSON");
      return;
    }

    setLoading(true);
    try {
      const url = isEdit ? `/api/platforms/${editId}` : "/api/platforms";
      const method = isEdit ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        type,
        credentials: parsedCreds,
        config: parsedConfig,
      };
      if (!isEdit) body.tenant_id = tenantId;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      router.refresh();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg space-y-4 rounded-lg border border-white/10 bg-zinc-900 p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-white">
          {isEdit ? "Edit Platform" : "Add Platform"}
        </h2>

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Platform Type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Platform Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PlatformType)}
            disabled={isEdit}
            className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-orange-500 disabled:opacity-50"
          >
            {PLATFORM_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Credentials */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Credentials (JSON)
          </label>
          <textarea
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            rows={5}
            placeholder='{"access_token": "...", "refresh_token": "..."}'
            className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-orange-500"
          />
        </div>

        {/* Config */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Config (JSON)
          </label>
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={3}
            placeholder='{"channel_id": "...", "default_privacy": "public"}'
            className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-orange-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors disabled:opacity-50"
          >
            {loading
              ? "Saving…"
              : isEdit
              ? "Update Platform"
              : "Add Platform"}
          </button>
        </div>
      </form>
    </div>
  );
}
