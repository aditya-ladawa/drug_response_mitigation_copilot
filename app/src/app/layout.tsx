import type { Metadata } from "next";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "PharmaSight. Drug Response Company.",
  description:
    "LOUD-inspired product experience for drug shortage response and mitigation.",
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
          <Navbar />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
