import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TenantProvider } from "@/components/tenant-context";
import MobileNavWrapper from "@/components/mobile-nav";

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
      <body className="bg-zinc-950 text-white overflow-x-hidden">
        <TenantProvider>
          <MobileNavWrapper>{children}</MobileNavWrapper>
        </TenantProvider>
      </body>
    </html>
  );
}
