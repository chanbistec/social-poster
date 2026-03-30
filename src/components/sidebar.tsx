"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tenants", label: "Tenants" },
  { href: "/posts", label: "Posts" },
  { href: "/calendar", label: "Calendar" },
];

export default function Sidebar({
  isOpen,
  onClose,
  className,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          // Base styles
          "flex h-screen w-64 flex-col border-r border-white/10 bg-zinc-950 px-4 py-6 text-white",
          // Mobile: fixed overlay, slide in/out
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible, static position
          "md:sticky md:top-0 md:translate-x-0 md:transition-none",
          className
        )}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Social Poster
            </h1>
            <p className="text-xs text-zinc-400">Multi-tenant social media ops</p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white md:hidden"
            aria-label="Close menu"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "rounded-md px-3 py-2.5 transition-colors min-h-[44px] flex items-center",
                  isActive
                    ? "border-l-2 border-orange-500 bg-zinc-800/80 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 text-xs text-zinc-500">
          v0.1 • Local instance
        </div>
      </aside>
    </>
  );
}
