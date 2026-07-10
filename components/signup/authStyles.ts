/**
 * Shared button styles for the auth surfaces (login + signup steps), matched to
 * the dashboard's action buttons so sign-in/sign-up use the same primitives.
 */

export const authPrimaryButton =
  "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft py-3 text-sm font-medium text-nexus-approval transition-colors hover:bg-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

export const authSecondaryButton =
  "glass-pill inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-atmospheric-grey transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-50";
