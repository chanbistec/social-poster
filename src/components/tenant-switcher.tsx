"use client";

import { useTenant } from "@/components/tenant-context";

export default function TenantSwitcher() {
  const { tenants, selectedTenantId, setSelectedTenantId } = useTenant();

  return (
    <div className="flex items-center gap-2">
      <label className="hidden text-xs text-zinc-400 sm:inline">Tenant</label>
      <select
        value={selectedTenantId}
        onChange={(e) => setSelectedTenantId(e.target.value)}
        className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 min-h-[44px] sm:min-h-0 sm:py-1"
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
