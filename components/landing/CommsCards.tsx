"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { computeCommsReveal } from "@/lib/landing/scrollPhases";
import { cn } from "@/lib/utils";

type CommsCardsProps = {
  progress: number;
  className?: string;
};

function CardShell({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[7px] bg-white/90 shadow-[0_22px_55px_rgba(0,0,0,0.34),0_2px_8px_rgba(0,0,0,0.16)] ring-0 backdrop-blur-2xl",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

function WhatsAppCard() {
  return (
    <CardShell className="w-[218px] bg-[#efe7dc]/95">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 shadow-[inset_0_-1px_rgba(0,0,0,0.14)]">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#4db6ac] to-[#00695c] text-[10px] font-semibold text-white">
          ER
        </div>
        <div>
          <p className="text-[11px] font-semibold text-white">Emma Rodriguez</p>
          <p className="text-[9px] text-white/70">online</p>
        </div>
      </div>
      <div className="space-y-2 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.72),transparent_34%),linear-gradient(135deg,#efe7dc,#d9cfc2)] p-3">
        <div className="ml-auto max-w-[86%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[10px] leading-snug text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.16)]">
          Your team saved us 3 deals this week. Genuinely impressed.
        </div>
        <div className="ml-auto max-w-[86%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[10px] leading-snug text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.16)]">
          ⭐⭐⭐⭐⭐ Would recommend to every founder.
        </div>
        <p className="text-right text-[8px] text-[#667781]">Read 2:14 PM ✓✓</p>
      </div>
    </CardShell>
  );
}

function GmailCard() {
  return (
    <CardShell className="w-[236px] bg-[#f8fafd]/95">
      <div className="flex items-center gap-2 bg-white/80 px-3 py-2 shadow-[inset_0_-1px_rgba(60,64,67,0.1)]">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-[#ea4335] to-[#c5221f] text-[9px] font-bold text-white">
          M
        </div>
        <span className="text-[11px] font-medium text-[#1d1d1f]">Gmail</span>
      </div>
      <div className="p-3">
        <div className="flex items-start gap-2 border-b border-[#dadce0] pb-2">
          <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#1a73e8]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-[#1d1d1f]">
              Billing dispute — need resolution today
            </p>
            <p className="truncate text-[9px] text-[#5f6368]">
              james.hart@acmecorp.com
            </p>
          </div>
          <span className="text-[8px] text-[#5f6368]">9:41 AM</span>
        </div>
        <p className="mt-2 line-clamp-3 text-[9px] leading-relaxed text-[#3c4043]">
          We were charged twice for the enterprise plan. This is unacceptable and
          I need someone to fix this before our board meeting…
        </p>
      </div>
    </CardShell>
  );
}

function InstagramCard() {
  return (
    <CardShell className="w-[202px] bg-[#fbfbfb]/95">
      <div className="flex items-center gap-2 bg-white/85 px-3 py-2 shadow-[inset_0_-1px_rgba(0,0,0,0.08)]">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]" />
        <p className="text-[10px] font-semibold text-[#1d1d1f]">Direct</p>
      </div>
      <div className="space-y-2 p-3">
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-[#efefef] px-2.5 py-1.5 text-[9px] text-[#111]">
          Hi! Do you offer API access for agencies?
        </div>
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-[#0095f6] px-2.5 py-1.5 text-[9px] text-white">
          We integrate with 40+ channels — happy to walk you through.
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-[#efefef] px-2.5 py-1.5 text-[9px] text-[#111]">
          Perfect. Can we book a demo this week?
        </div>
      </div>
    </CardShell>
  );
}

function LinkedInProfileCard() {
  return (
    <CardShell className="w-[208px] bg-[#f4f2ee]/95">
      <div className="bg-gradient-to-r from-[#0a66c2] to-[#064c95] px-3 py-2 shadow-[inset_0_-1px_rgba(0,0,0,0.18)]">
        <p className="text-[10px] font-semibold text-white">LinkedIn</p>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#d7d2c8] to-[#9d968b] text-[11px] font-semibold text-white">
            AK
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#1d1d1f]">
              Alex Kim
            </p>
            <p className="text-[8px] text-[#5f6368]">Senior AE · SaaS</p>
          </div>
        </div>
        <span className="mt-2 inline-block rounded-full bg-[#057642] px-2 py-0.5 text-[8px] font-semibold text-white">
          #OpenToWork
        </span>
        <p className="mt-2 text-[9px] leading-relaxed text-[#3c4043]">
          Open to revenue ops &amp; GTM roles. 8 yrs closing enterprise deals.
        </p>
      </div>
    </CardShell>
  );
}

function LinkedInMessageCard() {
  return (
    <CardShell className="w-[218px] bg-[#f4f2ee]/95">
      <div className="flex items-center gap-2 bg-[#f3f2ef] px-3 py-2 shadow-[inset_0_-1px_rgba(0,0,0,0.09)]">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#d6d6d6] to-[#9f9f9f] text-[8px] font-semibold text-white">
          JL
        </div>
        <p className="text-[10px] font-semibold text-[#1d1d1f]">
          Jordan Lee
        </p>
      </div>
      <div className="space-y-2 p-3">
        <div className="max-w-[85%] rounded-xl bg-[#f3f2ef] px-2.5 py-1.5 text-[9px] text-[#1d1d1f]">
          Saw your post on AI ops — we should partner on enterprise rollout.
        </div>
        <div className="ml-auto max-w-[85%] rounded-xl bg-[#d2e9ff] px-2.5 py-1.5 text-[9px] text-[#1d1d1f]">
          Absolutely. Sending our integration deck now.
        </div>
      </div>
    </CardShell>
  );
}

function BusinessQuestionCard() {
  return (
    <CardShell className="w-[226px] bg-[#f7f7f9]/95">
      <div className="flex items-center justify-between bg-white/75 px-3 py-2 shadow-[inset_0_-1px_rgba(0,0,0,0.08)]">
        <div>
          <p className="text-[10px] font-semibold text-[#1d1d1f]">
            Website inquiry
          </p>
          <p className="text-[8px] text-[#6e6e73]">pricing page</p>
        </div>
        <span className="rounded-full bg-[#eaf3ff] px-2 py-0.5 text-[8px] font-semibold text-[#0066cc]">
          New lead
        </span>
      </div>
      <div className="p-3">
        <p className="text-[9px] leading-relaxed text-[#3c4043]">
          We have 42 locations and need WhatsApp, Gmail, and Instagram routed to
          one approval queue. Can Nexus OS handle regional teams?
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2">
          <span className="text-[8px] text-[#6e6e73]">7 min ago</span>
          <span className="text-[8px] font-semibold text-[#057642]">
            $18k potential
          </span>
        </div>
      </div>
    </CardShell>
  );
}

const CARD_LAYOUT = [
  {
    id: "whatsapp",
    Component: WhatsAppCard,
    className: "left-[5%] top-[33%]",
    rotate: -5.5,
    stagger: 0,
  },
  {
    id: "gmail",
    Component: GmailCard,
    className: "right-[5%] top-[14%]",
    rotate: 4.2,
    stagger: 0.06,
  },
  {
    id: "instagram",
    Component: InstagramCard,
    className: "left-[5%] top-[68%]",
    rotate: -3.8,
    stagger: 0.12,
  },
  {
    id: "linkedin-msg",
    Component: LinkedInMessageCard,
    className: "right-[5%] top-[43%]",
    rotate: 5.5,
    stagger: 0.18,
  },
  {
    id: "linkedin-profile",
    Component: LinkedInProfileCard,
    className: "left-[5%] top-[10%]",
    rotate: -2.1,
    stagger: 0.24,
  },
  {
    id: "business-question",
    Component: BusinessQuestionCard,
    className: "right-[5%] top-[72%]",
    rotate: 2.6,
    stagger: 0.3,
  },
] as const;

export function CommsCards({ progress, className }: CommsCardsProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 hidden lg:block",
        className,
      )}
      aria-hidden
    >
      <div className="absolute left-1/2 top-[54%] h-[min(86vh,840px)] w-[min(112vw,1580px)] -translate-x-1/2 -translate-y-1/2">
        {CARD_LAYOUT.map(({ id, Component, className: pos, rotate, stagger }) => {
          const reveal = computeCommsReveal(progress, stagger);
          return (
            <motion.div
              key={id}
              className={cn("absolute max-w-[210px]", pos)}
              style={{
                opacity: reveal,
                transform: `translateY(${(1 - reveal) * 28}px) scale(${0.9 + reveal * 0.06}) rotate(${rotate * reveal}deg)`,
              }}
            >
              <Component />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function CommsCardsStatic({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      <WhatsAppCard />
      <GmailCard />
      <InstagramCard />
      <LinkedInProfileCard />
      <LinkedInMessageCard />
      <BusinessQuestionCard />
    </div>
  );
}
