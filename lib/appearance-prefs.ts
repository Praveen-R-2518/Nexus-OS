export const FONT_SCALE_STORAGE_KEY = "nexus-ui-font-scale";

export type FontScale = "compact" | "default" | "comfortable";

export const FONT_SCALE_OPTIONS: {
  value: FontScale;
  label: string;
  description: string;
}[] = [
  { value: "compact", label: "Compact", description: "Tighter dashboard text" },
  { value: "default", label: "Default", description: "Standard sizing" },
  { value: "comfortable", label: "Comfortable", description: "Larger dashboard text" },
];

export const THEME_OPTIONS = [
  { id: "dark" as const, label: "Command Night", description: "Deep obsidian workspace" },
  { id: "light" as const, label: "Signal Day", description: "Bright glass workspace" },
];

export function isFontScale(value: string | null | undefined): value is FontScale {
  return value === "compact" || value === "default" || value === "comfortable";
}

export function readFontScale(): FontScale {
  if (typeof window === "undefined") return "default";
  try {
    const stored = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    return isFontScale(stored) ? stored : "default";
  } catch {
    return "default";
  }
}

export function writeFontScale(scale: FontScale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
    window.dispatchEvent(new CustomEvent("nexus-font-scale-change", { detail: scale }));
  } catch {
    // ignore storage failures
  }
}

export function applyFontScaleToDocument(scale: FontScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-scale", scale);
}
