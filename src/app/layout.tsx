import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/sidebar";
import TenantSwitcher from "@/components/tenant-switcher";
import { TenantProvider } from "@/components/tenant-context";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Social Poster",
  description: "Multi-tenant social media posting platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="bg-zinc-950 text-white">
        <TenantProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col">
              <header className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold">Dashboard</h2>
                  <p className="text-xs text-zinc-400">Multi-tenant content control</p>
                </div>
                <TenantSwitcher />
              </header>
              <main className="flex-1 bg-zinc-950 p-6">{children}</main>
            </div>
          </div>
        </TenantProvider>
      </body>
    </html>
  );
}
