"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformType } from "@/lib/types";

const PLATFORM_TYPES: { value: PlatformType; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

const META_TYPES: PlatformType[] = ["instagram", "facebook"];
const OAUTH_TYPES: PlatformType[] = ["youtube", ...META_TYPES];

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
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showManualMeta, setShowManualMeta] = useState(() => !META_TYPES.includes(defaultType ?? "youtube"));
  const [error, setError] = useState<string | null>(null);

  const isEdit = editId !== undefined;
  const isMetaType = META_TYPES.includes(type);
  const isOAuthType = OAUTH_TYPES.includes(type);
  const dialogTitle = isEdit ? `Edit ${type[0].toUpperCase()}${type.slice(1)} Platform` : "Add Platform";

  const oauthLabel = useMemo(() => {
    if (type === "instagram") return isEdit ? "Reconnect Instagram with Meta" : "Connect Instagram with Meta";
    if (type === "facebook") return isEdit ? "Reconnect Facebook with Meta" : "Connect Facebook with Meta";
    if (type === "youtube") return isEdit ? "Reconnect YouTube" : "Connect YouTube";
    return "Connect with OAuth";
  }, [isEdit, type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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

  function handleMetaConnect() {
    setOauthLoading(true);
    if (type === "youtube") {
      const params = new URLSearchParams({ tenant_id: tenantId });
      window.location.href = `/api/platforms/youtube/start?${params.toString()}`;
      return;
    }

    const params = new URLSearchParams({ tenant_id: tenantId, type });
    window.location.href = `/api/platforms/meta/start?${params.toString()}`;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm sm:flex sm:items-center sm:justify-center">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl space-y-4 rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-xl sm:p-6"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">{dialogTitle}</h2>
          <p className="text-sm text-zinc-400">
            {isMetaType
              ? "Use Meta login for the normal setup flow. Manual JSON is still here for recovery and advanced cases."
              : type === "youtube"
                ? "Use Google OAuth for the normal YouTube setup flow. Manual JSON is still here for recovery and advanced cases."
                : "Add platform credentials and config."}
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">Platform Type</label>
          <select
            value={type}
            onChange={(e) => {
              const nextType = e.target.value as PlatformType;
              setType(nextType);
              setShowManualMeta(!META_TYPES.includes(nextType));
            }}
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

        {isOAuthType && (
          <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-950/30 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {type === "youtube" ? "Google OAuth is the primary setup path" : "Meta login is the primary setup path"}
                </p>
                <p className="text-sm text-zinc-300">
                  {type === "youtube"
                    ? "We&apos;ll open Google, request YouTube upload access, then save the channel connection back to this tenant."
                    : "We&apos;ll open Meta, ask for page access, then save the page token and account details back to this tenant."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleMetaConnect}
                disabled={oauthLoading}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
              >
                {oauthLoading ? "Redirecting…" : oauthLabel}
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              {type === "instagram"
                ? "The app will connect the first Facebook page in this Meta login that has an attached Instagram business account."
                : type === "facebook"
                  ? "The app will connect the first Facebook page available in this Meta login."
                  : "The app will connect the YouTube channel for the signed-in Google account and store the refresh token for future uploads."}
            </div>
          </div>
        )}

        {(!isOAuthType || showManualMeta) && (
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-zinc-300">Credentials (JSON)</label>
                {isMetaType && (
                  <button
                    type="button"
                    onClick={() => setShowManualMeta(false)}
                    className="text-xs text-orange-300 hover:text-orange-200"
                  >
                    Hide manual fallback
                  </button>
                )}
              </div>
              <textarea
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                rows={6}
                placeholder='{"access_token": "...", "refresh_token": "..."}'
                className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Config (JSON)</label>
              <textarea
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                rows={4}
                placeholder='{"channel_id": "...", "default_privacy": "public"}'
                className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-orange-500"
              />
            </div>
          </div>
        )}

        {isOAuthType && !showManualMeta && (
          <button
            type="button"
            onClick={() => setShowManualMeta(true)}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Need the advanced fallback? Edit JSON manually instead.
          </button>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : isEdit ? "Update Platform" : "Add Platform"}
          </button>
        </div>
      </form>
    </div>
  );
}
