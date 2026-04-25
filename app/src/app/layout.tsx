import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drug Shortage Copilot",
  description:
    "Command-center UI for investigating drug shortages with a globe, graph, and agent stream.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="relative min-h-screen overflow-x-clip bg-black text-white">
          {children}
        </div>
      </body>
    </html>
  );
}
