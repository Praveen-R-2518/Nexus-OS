"use client";

import { useEffect, useState } from "react";
import {
  applyFontScaleToDocument,
  readFontScale,
  type FontScale,
  writeFontScale,
} from "@/lib/appearance-prefs";

export function useAppearancePrefs() {
  const [fontScale, setFontScaleState] = useState<FontScale>("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const scale = readFontScale();
    setFontScaleState(scale);
    applyFontScaleToDocument(scale);

    function onChange(event: Event) {
      const detail = (event as CustomEvent<FontScale>).detail;
      if (detail) setFontScaleState(detail);
    }

    window.addEventListener("nexus-font-scale-change", onChange);
    return () => window.removeEventListener("nexus-font-scale-change", onChange);
  }, []);

  function setFontScale(scale: FontScale) {
    writeFontScale(scale);
    setFontScaleState(scale);
    applyFontScaleToDocument(scale);
  }

  return { fontScale, mounted, setFontScale };
}
