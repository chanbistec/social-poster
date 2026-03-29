import Link from "next/link";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tenants", label: "Tenants" },
  { href: "/posts", label: "Posts" },
  { href: "/calendar", label: "Calendar" },
];

export default function Sidebar({ className }: { className?: string }) {
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

      <nav className="flex flex-col gap-2 text-sm">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto pt-6 text-xs text-zinc-500">
        v0.1 • Local instance
      </div>
    </aside>
  );
}
