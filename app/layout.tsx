import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Nexus OS",
  description: "AI inbox and revenue rescue command center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-900 font-sans text-gray-100 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
