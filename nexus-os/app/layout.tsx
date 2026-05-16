import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

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
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-h-screen flex-1 flex-col pl-[240px]">
            <TopBar />
            <main className="flex-1 bg-gray-900 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
