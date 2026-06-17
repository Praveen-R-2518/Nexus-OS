"use client";

import { Style_Script } from "next/font/google";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

const styleScript = Style_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-style-script",
  display: "swap",
});

export function QuoteSection() {
  return (
    <section
      className={`apple-section bg-apple-bg ${styleScript.variable}`}
    >
      <ScrollReveal className="apple-section-content">
        <div className="relative overflow-hidden rounded-3xl bg-apple-bg-alt px-8 py-20 text-center md:px-16 md:py-28">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0, 113, 227, 0.06), transparent 70%)",
            }}
          />
          <blockquote
            className="relative text-4xl font-normal leading-relaxed tracking-normal text-apple-text md:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-style-script), cursive" }}
          >
            &ldquo;We built Nexus OS because founders shouldn&rsquo;t have to
            choose between saving time and saving revenue.&rdquo;
          </blockquote>
          <div className="relative mt-12 flex justify-center">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-apple-text-secondary">
              The Nexus Team
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
