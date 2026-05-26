import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

const aeSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-ae-sans",
  display: "swap",
});

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${aeSans.variable} ae-onboarding-root min-h-[100dvh]`}>
      {children}
    </div>
  );
}
