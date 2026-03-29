"use client";

import { useState } from "react";
import PlatformForm from "@/components/platform-form";

export default function PlatformActions({ tenantId }: { tenantId: string }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 transition-colors"
      >
        + Add Platform
      </button>
      {showForm && (
        <PlatformForm tenantId={tenantId} onClose={() => setShowForm(false)} />
      )}
    </>
  );
}
