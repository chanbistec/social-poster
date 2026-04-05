"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BulkRetryButtonProps = {
  endpoint: string;
  label: string;
  busyLabel: string;
  emptyLabel: string;
  count: number;
  tenantId?: string;
};

export default function BulkRetryButton({
  endpoint,
  label,
  busyLabel,
  emptyLabel,
  count,
  tenantId,
}: BulkRetryButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    if (count <= 0 || loading) return;
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId || null }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Bulk retry failed");
        return;
      }

      const processed = data.data?.processed ?? 0;
      const skipped = data.data?.skipped ?? 0;
      setMessage(
        skipped > 0
          ? `Retried ${processed} item${processed === 1 ? "" : "s"}; skipped ${skipped}.`
          : `Retried ${processed} item${processed === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleRetry}
        disabled={count <= 0 || loading}
        className={`inline-flex min-h-[40px] items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${count > 0 ? "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20" : "border border-white/10 bg-zinc-900 text-zinc-500"}`}
      >
        {loading ? busyLabel : count > 0 ? label : emptyLabel}
      </button>
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
