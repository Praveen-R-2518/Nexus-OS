export const WORKSPACE_INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "E-commerce",
  "Consulting",
  "Real Estate",
  "Education",
  "Other",
] as const;

export type WorkspaceIndustry = (typeof WORKSPACE_INDUSTRIES)[number];

export function workspaceIndustryOptions(current?: string | null): string[] {
  const trimmed = current?.trim();
  if (trimmed && !WORKSPACE_INDUSTRIES.includes(trimmed as WorkspaceIndustry)) {
    return [trimmed, ...WORKSPACE_INDUSTRIES];
  }
  return [...WORKSPACE_INDUSTRIES];
}
