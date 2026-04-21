"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PlatformType } from "@/lib/types";
import PlatformForm from "./platform-form";

const typeColors: Record<PlatformType, string> = {
  youtube: "bg-red-500/20 text-red-300 border-red-500/30",
  instagram: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  facebook: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const typeLabels: Record<PlatformType, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};

function tokenStatus(expiresAt?: string | null) {
  if (!expiresAt) return { label: "Valid", color: "text-emerald-400" };
  const days = (new Date(expiresAt).getTime() - Date.now()) / 864e5;
  if (days < 0) return { label: "Expired", color: "text-rose-400" };
  if (days < 7)
    return { label: `Expires in ${Math.ceil(days)}d`, color: "text-amber-400" };
  return { label: "Valid", color: "text-emerald-400" };
}

function maskCredentials(creds: Record<string, unknown>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const key of Object.keys(creds)) {
    masked[key] = "••••••••";
  }
  return masked;
}

interface PlatformCardProps {
  id: number;
  tenantId: string;
  type: PlatformType;
  credentials: Record<string, unknown>;
  config: Record<string, unknown> | null;
  tokenExpiresAt?: string | null;
  enabled: boolean;
}

export default function PlatformCard({
  id,
  tenantId,
  type,
  credentials,
  config,
  tokenExpiresAt,
  enabled,
}: PlatformCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const status = tokenStatus(tokenExpiresAt);
  const masked = maskCredentials(credentials);
  const isMeta = type === "instagram" || type === "facebook";
  const isYouTube = type === "youtube";

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/platforms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete platform");
        return;
      }
      toast.success("Platform deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete platform");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function handleReconnect() {
    if (isYouTube) {
      const params = new URLSearchParams({ tenant_id: tenantId });
      window.location.href = `/api/platforms/youtube/start?${params.toString()}`;
      return;
    }

    const params = new URLSearchParams({ tenant_id: tenantId, type });
    window.location.href = `/api/platforms/meta/start?${params.toString()}`;
  }

  return (
    <>
      <div className="space-y-3 rounded-lg border border-white/10 bg-zinc-800/60 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2.5 py-0.5 text-xs font-medium",
                typeColors[type]
              )}
            >
              {typeLabels[type]}
            </span>
            <span className={cn("text-xs font-medium", status.color)}>
              {status.label}
            </span>
            {!enabled && <span className="text-xs text-zinc-500">(disabled)</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(isMeta || isYouTube) && (
              <button
                onClick={handleReconnect}
                className="rounded-md px-2.5 py-1 text-xs text-orange-300 transition-colors hover:bg-orange-500/20 hover:text-orange-200"
              >
                {isYouTube ? "Reconnect YouTube" : "Reconnect Meta"}
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/platforms/${id}/refresh`, { method: "POST" });
                  const data = await res.json();
                  if (!res.ok) toast.error(data.error || "Refresh failed");
                  else {
                    toast.success(data.data.message);
                    router.refresh();
                  }
                } catch {
                  toast.error("Refresh failed");
                }
              }}
              className="rounded-md px-2.5 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20 hover:text-emerald-300"
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
            >
              Edit
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {(isMeta || isYouTube) && (
          <div className="rounded-md border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-xs text-zinc-300">
            {isYouTube
              ? "YouTube OAuth is the preferred setup path here. Manual JSON editing remains available under Edit for recovery cases."
              : "Meta OAuth is the preferred setup path here. Manual JSON editing remains available under Edit for recovery cases."}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Credentials
          </p>
          <div className="space-y-0.5 rounded-md bg-zinc-900/80 px-3 py-2 text-xs font-mono text-zinc-400">
            {Object.entries(masked).map(([key, val]) => (
              <div key={key}>
                <span className="text-zinc-500">{key}:</span>{" "}
                <span className="text-zinc-400">{val}</span>
              </div>
            ))}
            {Object.keys(masked).length === 0 && (
              <span className="text-zinc-600">No credentials</span>
            )}
          </div>
        </div>

        {config && Object.keys(config).length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Config
            </p>
            <div className="space-y-0.5 rounded-md bg-zinc-900/80 px-3 py-2 text-xs font-mono text-zinc-400">
              {Object.entries(config).map(([key, val]) => (
                <div key={key}>
                  <span className="text-zinc-500">{key}:</span>{" "}
                  <span className="text-zinc-300">
                    {typeof val === "string" ? val : JSON.stringify(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <PlatformForm
          tenantId={tenantId}
          editId={id}
          defaultType={type}
          defaultCredentials={JSON.stringify(credentials, null, 2)}
          defaultConfig={JSON.stringify(config ?? {}, null, 2)}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
