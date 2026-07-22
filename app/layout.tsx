import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter, Source_Sans_3 } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-source-sans-3",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nexus OS",
    template: "%s · Nexus OS",
  },
  description: "AI inbox and revenue rescue command center",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`swiss-dark ${geistSans.variable} ${geistMono.variable} ${sourceSans3.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-surface-page font-chrome text-atmospheric-grey antialiased transition-colors duration-300 dark:bg-obsidian">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var themes=['swiss-dark','swiss-light','dark','light','aurora-dark','aurora-light'];var k='theme',s=localStorage.getItem(k),r=s;if(!r)r='swiss-dark';if(r==='system')r=window.matchMedia('(prefers-color-scheme: dark)').matches?'swiss-dark':'swiss-light';if(themes.indexOf(r)===-1)r='swiss-dark';var el=document.documentElement;themes.forEach(function(t){el.classList.remove(t);});el.classList.add(r);}catch(e){document.documentElement.classList.add('swiss-dark');}})();`}
        </Script>
        <Script id="font-scale-init" strategy="beforeInteractive">
          {`(function(){try{var k='nexus-ui-font-scale',s=localStorage.getItem(k),v=s;if(v!=='compact'&&v!=='default'&&v!=='comfortable')v='default';document.documentElement.setAttribute('data-font-scale',v);}catch(e){document.documentElement.setAttribute('data-font-scale','default');}})();`}
        </Script>
        <ThemeProvider
          attribute="class"
          defaultTheme="swiss-dark"
          themes={["swiss-dark", "swiss-light", "dark", "light", "aurora-dark", "aurora-light"]}
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AppShell>{children}</AppShell>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
