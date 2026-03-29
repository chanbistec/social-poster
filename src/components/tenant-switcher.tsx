"use client";

import { useEffect, useState } from "react";

interface Tenant {
  id: string;
  name: string;
}

export default function TenantSwitcher() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.data || []);
        if (d.data?.length) setSelected(d.data[0].id);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-zinc-400">Tenant</label>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
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
