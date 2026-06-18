"use client";

export function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="ambient-glow absolute left-1/2 top-1/2 h-[min(80vw,600px)] w-[min(80vw,600px)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.35]"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 113, 227, 0.08) 0%, rgba(0, 113, 227, 0.02) 45%, transparent 70%)",
        }}
      />
      <div
        className="ambient-grain absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, #0071e3 0.5px, transparent 0.5px), radial-gradient(circle at 80% 70%, #1d1d1f 0.5px, transparent 0.5px)",
          backgroundSize: "48px 48px, 64px 64px",
        }}
      />
    </div>
  );
}
