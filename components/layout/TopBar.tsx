"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

export default function TopBar() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-950/90 px-6 backdrop-blur">
      <span className="font-mono text-sm font-semibold tracking-wide text-gray-100">
        NEXUS OS
      </span>
      <time
        dateTime={now.toISOString()}
        className="font-mono text-sm tabular-nums text-emerald-400"
      >
        {format(now, "yyyy-MM-dd HH:mm:ss")}
      </time>
    </header>
  );
}
