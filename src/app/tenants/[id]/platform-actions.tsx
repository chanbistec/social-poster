"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PlatformForm from "@/components/platform-form";
import type { PlatformType } from "@/lib/types";

export default function PlatformActions({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [defaultType, setDefaultType] = useState<PlatformType | undefined>();

  useEffect(() => {
    const status = searchParams.get("platform_connect");
    const message = searchParams.get("message");
    if (!status || !message) return;

    if (status === "success") toast.success(message);
    else toast.error(message);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("platform_connect");
    params.delete("message");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    router.refresh();
  }, [pathname, router, searchParams]);

  function openForm(type?: PlatformType) {
    setDefaultType(type);
    setShowForm(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => {
            const params = new URLSearchParams({ tenant_id: tenantId });
            window.location.href = `/api/platforms/youtube/start?${params.toString()}`;
          }}
          className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
        >
          Connect YouTube
        </button>
        <button
          onClick={() => openForm("facebook")}
          className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
        >
          Connect Facebook
        </button>
        <button
          onClick={() => openForm("instagram")}
          className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200 transition-colors hover:bg-orange-500/20"
        >
          Connect Instagram
        </button>
        <button
          onClick={() => openForm()}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-500"
        >
          + Add Platform
        </button>
      </div>
      {showForm && (
        <PlatformForm
          tenantId={tenantId}
          defaultType={defaultType}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
