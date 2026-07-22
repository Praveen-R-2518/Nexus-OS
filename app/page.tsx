import { ChannelMarquee } from "@/components/landing/ChannelMarquee";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeatureBento } from "@/components/landing/FeatureBento";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { IntegrationsSection } from "@/components/landing/IntegrationsSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { ProductTour } from "@/components/landing/ProductTour";
import { ProtocolStepper } from "@/components/landing/ProtocolStepper";
import { StakesSection } from "@/components/landing/StakesSection";
import { TestimonialSection } from "@/components/landing/TestimonialSection";
import { TrustSection } from "@/components/landing/TrustSection";

/**
 * Light mode only — see `.dark .landing-full-bleed` in globals.css, which pins
 * the tokens back to light even when the app theme is dark. No component on
 * this page may use a `dark:` utility.
 */
export default function LandingPage() {
  return (
    <div className="flex-1 bg-white text-[#1d1d1f]">
      <Hero />
      <ChannelMarquee />
      <StakesSection />
      <ProductTour />
      <ProtocolStepper />
      <FeatureBento />
      <TrustSection />
      <IntegrationsSection />
      {/* Renders nothing until real quotes exist in lib/landing/testimonials.ts */}
      <TestimonialSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </div>
  );
}
