"use client";

import { useState, useCallback } from "react";
import Sidebar from "@/components/sidebar";
import TenantSwitcher from "@/components/tenant-switcher";

export default function MobileNavWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center justify-center rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white md:hidden"
              aria-label="Open menu"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold">Social Poster</h2>
              <p className="hidden text-xs text-zinc-400 sm:block">
                Multi-tenant content control
              </p>
            </div>
          </div>
          <TenantSwitcher />
        </header>

        <main className="flex-1 bg-zinc-950 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
