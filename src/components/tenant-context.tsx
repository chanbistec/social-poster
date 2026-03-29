"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface Tenant {
  id: string;
  name: string;
}

interface TenantContextValue {
  tenants: Tenant[];
  selectedTenantId: string;
  setSelectedTenantId: (id: string) => void;
  selectedTenant: Tenant | undefined;
}

const TenantContext = createContext<TenantContextValue>({
  tenants: [],
  selectedTenantId: "",
  setSelectedTenantId: () => {},
  selectedTenant: undefined,
});

const STORAGE_KEY = "sp_tenant";

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantIdState] = useState<string>("");

  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => r.json())
      .then((d) => {
        const list: Tenant[] = d.data || [];
        setTenants(list);

        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        const valid = list.find((t) => t.id === stored);
        if (valid) {
          setSelectedTenantIdState(valid.id);
        } else if (list.length) {
          setSelectedTenantIdState(list[0].id);
          localStorage.setItem(STORAGE_KEY, list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const setSelectedTenantId = (id: string) => {
    setSelectedTenantIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  };

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  return (
    <TenantContext.Provider value={{ tenants, selectedTenantId, setSelectedTenantId, selectedTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
