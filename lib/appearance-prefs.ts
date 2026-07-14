export const FONT_SCALE_STORAGE_KEY = "nexus-ui-font-scale";

export type FontScale = "compact" | "default" | "comfortable";

export type ThemeId = "dark" | "light" | "aurora-dark" | "aurora-light";

export const THEME_OPTIONS: {
  id: ThemeId;
  label: string;
  description: string;
}[] = [
  { id: "dark", label: "Command Night", description: "Deep obsidian workspace" },
  { id: "light", label: "Signal Day", description: "Bright glass workspace" },
  { id: "aurora-dark", label: "Aurora Night", description: "Cool navy command surface" },
  { id: "aurora-light", label: "Aurora Day", description: "Clean mint-white workspace" },
];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return (
    value === "dark" ||
    value === "light" ||
    value === "aurora-dark" ||
    value === "aurora-light"
  );
}

export function getAlternateTheme(theme: ThemeId): ThemeId {
  if (theme === "aurora-dark") return "aurora-light";
  if (theme === "aurora-light") return "aurora-dark";
  if (theme === "light") return "dark";
  return "light";
}

export function isAuroraTheme(theme: string | undefined): boolean {
  return theme === "aurora-dark" || theme === "aurora-light";
}

export const FONT_SCALE_OPTIONS: {
  value: FontScale;
  label: string;
  description: string;
}[] = [
  { value: "compact", label: "Compact", description: "Tighter dashboard text" },
  { value: "default", label: "Default", description: "Standard sizing" },
  { value: "comfortable", label: "Comfortable", description: "Larger dashboard text" },
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
