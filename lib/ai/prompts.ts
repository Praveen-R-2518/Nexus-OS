import "server-only";

import fs from "fs";
import path from "path";

/**
 * Loads a prompt file from `ai_prompts/` (repo root). Shared by every `lib/ai/*` function so the
 * prompt text lives in one place — not duplicated into n8n Code nodes or route handlers.
 * Cached in-memory per process; set `NEXUS_PROMPT_DIR` to override the folder (matches the n8n
 * Code-node convention in `n8n_logic/*.js`).
 */
const cache = new Map<string, string>();

function resolvePromptDir(): string {
  const envDir = process.env.NEXUS_PROMPT_DIR?.trim();
  const candidates = [envDir, path.join(process.cwd(), "ai_prompts")].filter(
    (d): d is string => !!d,
  );
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  throw new Error(
    "Cannot resolve ai_prompts directory. Set NEXUS_PROMPT_DIR or run from the repo root.",
  );
}

export function loadPrompt(fileName: string): string {
  const cached = cache.get(fileName);
  if (cached !== undefined) return cached;
  const dir = resolvePromptDir();
  const full = path.join(dir, fileName);
  if (!fs.existsSync(full)) {
    throw new Error(`Prompt file not found: ${full}`);
  }
  const text = fs.readFileSync(full, "utf8");
  cache.set(fileName, text);
  return text;
}
