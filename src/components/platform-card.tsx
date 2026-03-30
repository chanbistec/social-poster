"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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

/** Mask all values in a credentials object */
function maskCredentials(
  creds: Record<string, unknown>
): Record<string, string> {
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

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/platforms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete platform");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to delete platform");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-zinc-800/60 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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
            {!enabled && (
              <span className="text-xs text-zinc-500">(disabled)</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/platforms/${id}/refresh`, { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok) alert(data.error || 'Refresh failed');
                  else { alert(data.data.message); router.refresh(); }
                } catch { alert('Refresh failed'); }
              }}
              className="rounded-md px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              Edit
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-2.5 py-1 text-xs text-zinc-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2.5 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Credentials (masked) */}
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Credentials
          </p>
          <div className="rounded-md bg-zinc-900/80 px-3 py-2 text-xs font-mono text-zinc-400 space-y-0.5">
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

        {/* Config summary */}
        {config && Object.keys(config).length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Config
            </p>
            <div className="rounded-md bg-zinc-900/80 px-3 py-2 text-xs font-mono text-zinc-400 space-y-0.5">
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

      {/* Edit modal */}
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
