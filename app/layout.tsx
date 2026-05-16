import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus OS",
  description: "Revenue Command Center for founder-led service businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-50">
        {children}
      </body>
    </html>
  );
}
