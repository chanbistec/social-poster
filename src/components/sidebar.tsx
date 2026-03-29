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

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen w-64 flex-col border-r border-white/10 bg-zinc-950 px-4 py-6 text-white",
        className
      )}
    >
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-white">Social Poster</h1>
        <p className="text-xs text-zinc-400">Multi-tenant social media ops</p>
      </div>

      <nav className="flex flex-col gap-1 text-sm">
        {nav.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 transition-colors",
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
  );
}
