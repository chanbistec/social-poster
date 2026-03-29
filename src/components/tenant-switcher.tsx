"use client";

import { useTenant } from "@/components/tenant-context";

export default function TenantSwitcher() {
  const { tenants, selectedTenantId, setSelectedTenantId } = useTenant();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-zinc-400">Tenant</label>
      <select
        value={selectedTenantId}
        onChange={(e) => setSelectedTenantId(e.target.value)}
        className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
