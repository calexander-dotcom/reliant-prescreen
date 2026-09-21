import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import { currentBuild } from "@/lib/build";
import "./globals.css";

export const metadata: Metadata = {
  title: "One Downs",
  description:
    "Track a round and the money: zero-sum hole entry, nassau with presses, and skins.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "One Downs" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#23542f",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">{children}</div>
        {/* The page learns which build served it, to notice when a newer one is live. */}
        <ServiceWorker build={currentBuild()} />
      </body>
    </html>
  );
}
