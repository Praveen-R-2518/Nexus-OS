import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

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
    <html lang="en" className={`${plusJakartaSans.variable} dark`}>
      <body className="min-h-screen bg-obsidian font-sans text-atmospheric-grey antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
