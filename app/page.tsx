"use client";

import { HeroSequence } from "@/components/landing/HeroSequence";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { QuoteSection } from "@/components/landing/QuoteSection";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex-1 bg-apple-bg text-apple-text">
      <HeroSequence />
      <ProcessSection />
      <QuoteSection />
    </div>
  );
}
