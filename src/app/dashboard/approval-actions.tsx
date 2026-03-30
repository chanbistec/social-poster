"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApproveButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve");
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleApprove}
      disabled={loading}
      className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
    >
      {loading ? "Approving…" : "Approve"}
    </button>
  );
}

export function RejectButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reject");
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleReject}
      disabled={loading}
      className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
    >
      {loading ? "Rejecting…" : "Reject"}
    </button>
  );
}
