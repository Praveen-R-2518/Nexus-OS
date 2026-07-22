"use client";

import { FaqSection } from "@/components/landing/FaqSection";
import { FinalCta } from "@/components/landing/FinalCta";
import { PricingSection } from "@/components/landing/PricingSection";

/**
 * Same pricing surface as the landing page — one price list, one presentation.
 * The shared `components/pricing/*` cards stay for any legacy imports but are
 * not used here because they carry `dark:` utilities.
 */
export default function PricingPage() {
  return (
    <div className="flex-1 bg-white text-[#1d1d1f]">
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </div>
  );
}
