/**
 * Shared button styles for login + signup — matched to the landing LiftButton
 * language (rounded-full primary / hairline secondary). No `dark:` utilities:
 * these surfaces live inside `.landing-full-bleed`.
 */

export const authPrimaryButton =
  "inline-flex w-full min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[color:var(--nexus-approval)] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#2b82ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const authSecondaryButton =
  "inline-flex w-full min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[color:var(--apple-hairline)] bg-white px-6 py-3 text-[15px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
