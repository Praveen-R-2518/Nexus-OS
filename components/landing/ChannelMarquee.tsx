"use client";

import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { CHANNELS, MARQUEE } from "@/lib/landing/content";

/**
 * Two opposing rows of real integrations. The track holds the list twice so a
 * -50% translate loops seamlessly; edges are masked rather than faded with a
 * gradient overlay, so it works on any background.
 *
 * Pauses on hover and on keyboard focus, and stops entirely under
 * `prefers-reduced-motion` (see .landing-marquee-track in globals.css).
 */

function ChannelTile({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-full border border-[color:var(--apple-hairline)] bg-white py-2.5 pl-4 pr-5">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c7c7cc]"
        aria-hidden
      />
      <span className="whitespace-nowrap text-[14px] font-medium text-[#1d1d1f]">
        {name}
      </span>
      <span className="whitespace-nowrap font-mono text-[10px] text-[#86868b]">
        {note}
      </span>
    </div>
  );
}

function Row({
  reverse,
  duration,
}: {
  reverse?: boolean;
  duration: string;
}) {
  return (
    <div
      className="landing-marquee landing-marquee-mask overflow-hidden"
      style={{ ["--marquee-duration" as string]: duration }}
    >
      <div
        className="landing-marquee-track flex w-max gap-3"
        data-direction={reverse ? "reverse" : undefined}
      >
        {[...CHANNELS, ...CHANNELS].map((c, i) => (
          <ChannelTile key={`${c.name}-${i}`} name={c.name} note={c.note} />
        ))}
      </div>
    </div>
  );
}

export function ChannelMarquee() {
  return (
    <section className="border-t border-[color:var(--apple-hairline)] bg-white py-16 md:py-20">
      <div className="mx-auto mb-10 w-full max-w-[980px] px-5 text-center md:px-8">
        <Reveal>
          <Eyebrow align="center">{MARQUEE.eyebrow}</Eyebrow>
          <p className="mt-4 text-[19px] font-medium text-[#1d1d1f] md:text-[22px]">
            {MARQUEE.title}
          </p>
        </Reveal>
      </div>

      {/* Full-bleed: the marquee must run past the text measure to read as a
          continuous belt rather than a scrolling box. */}
      <div className="space-y-3" aria-hidden>
        <Row duration="52s" />
        <Row duration="64s" reverse />
      </div>

      <p className="sr-only">
        Supported integrations: {CHANNELS.map((c) => c.name).join(", ")}.
      </p>
    </section>
  );
}
