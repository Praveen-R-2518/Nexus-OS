"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/signup?step=workspace");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center font-mono text-xs uppercase tracking-widest text-muted">
      Redirecting to signup…
    </div>
  );
}
