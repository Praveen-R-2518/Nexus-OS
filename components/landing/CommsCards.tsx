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
        "overflow-hidden rounded-sm border border-black/10 bg-white/95 shadow-[0_28px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl",
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
    <CardShell className="w-[220px]">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5">
        <div className="h-7 w-7 rounded-full bg-white/20" />
        <div>
          <p className="text-[11px] font-semibold text-white">Emma Rodriguez</p>
          <p className="text-[9px] text-white/70">online</p>
        </div>
      </div>
      <div className="space-y-2 bg-[#e5ddd5] p-3">
        <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-2.5 py-1.5 text-[10px] leading-snug text-[#111] shadow-sm">
          Your team saved us 3 deals this week. Genuinely impressed.
        </div>
        <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-2.5 py-1.5 text-[10px] leading-snug text-[#111] shadow-sm">
          ⭐⭐⭐⭐⭐ Would recommend to every founder.
        </div>
        <p className="text-right text-[8px] text-[#667781]">Read 2:14 PM ✓✓</p>
      </div>
    </CardShell>
  );
}

function GmailCard() {
  return (
    <CardShell className="w-[240px]">
      <div className="flex items-center gap-2 border-b border-black/6 px-3 py-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-[#ea4335] text-[9px] font-bold text-white">
          M
        </div>
        <span className="text-[11px] font-medium text-[#1d1d1f]">Gmail</span>
      </div>
      <div className="p-3">
        <div className="flex items-start gap-2 border-b border-black/5 pb-2">
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
    <CardShell className="w-[200px]">
      <div className="flex items-center gap-2 border-b border-black/6 px-3 py-2">
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
    <CardShell className="w-[210px]">
      <div className="bg-[#0a66c2] px-3 py-2">
        <p className="text-[10px] font-semibold text-white">LinkedIn</p>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-[#e8e8e8]" />
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
    <CardShell className="w-[220px]">
      <div className="flex items-center gap-2 border-b border-black/6 bg-[#f3f2ef] px-3 py-2">
        <div className="h-6 w-6 rounded-full bg-[#c7c7c7]" />
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
    <CardShell className="w-[230px]">
      <div className="flex items-center justify-between border-b border-black/6 px-3 py-2">
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
    className: "left-[2%] top-[18%]",
    rotate: -5.5,
    stagger: 0,
  },
  {
    id: "gmail",
    Component: GmailCard,
    className: "right-[1%] top-[10%]",
    rotate: 4.2,
    stagger: 0.06,
  },
  {
    id: "instagram",
    Component: InstagramCard,
    className: "left-[8%] top-[64%]",
    rotate: -3.8,
    stagger: 0.12,
  },
  {
    id: "linkedin-msg",
    Component: LinkedInMessageCard,
    className: "right-[4%] top-[52%]",
    rotate: 5.5,
    stagger: 0.18,
  },
  {
    id: "linkedin-profile",
    Component: LinkedInProfileCard,
    className: "left-[20%] top-[4%]",
    rotate: -2.1,
    stagger: 0.24,
  },
  {
    id: "business-question",
    Component: BusinessQuestionCard,
    className: "left-[39%] top-[76%]",
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
      <div className="absolute left-1/2 top-[54%] h-[min(78vh,760px)] w-[min(94vw,1180px)] -translate-x-1/2 -translate-y-1/2">
        {CARD_LAYOUT.map(({ id, Component, className: pos, rotate, stagger }) => {
          const reveal = computeCommsReveal(progress, stagger);
          return (
            <motion.div
              key={id}
              className={cn("absolute max-w-[240px]", pos)}
              style={{
                opacity: reveal,
                transform: `translateY(${(1 - reveal) * 28}px) scale(${0.94 + reveal * 0.06}) rotate(${rotate * reveal}deg)`,
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
