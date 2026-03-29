"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewTenantPage() {
  const router = useRouter();
  const [form, setForm] = useState({ id: "", name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create tenant");
      setLoading(false);
      return;
    }

    const data = await res.json();
    router.push(`/tenants/${data.data.id}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Tenant</h1>
        <p className="text-sm text-zinc-400">
          Add a business with its own social media accounts
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-zinc-400">Tenant ID (slug)</label>
          <input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="area6"
            required
          />
          <p className="mt-1 text-xs text-zinc-500">Lowercase letters, numbers, and dashes only.</p>
        </div>

        <div>
          <label className="text-xs text-zinc-400">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="Quality Life Fitness"
            required
          />
        </div>

        <div>
          <label className="text-xs text-zinc-400">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="Premium fitness brand in Kadawatha"
            rows={3}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          disabled={loading}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Tenant"}
        </button>
      </form>
    </div>
  );
}
