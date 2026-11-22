import type { PeopleEmailPurpose, PeopleEmailTone } from "@/types";

export const PEOPLE_EMAIL_PURPOSE_LABELS: Record<PeopleEmailPurpose, string> = {
  follow_up: "Follow-up",
  scheduling: "Scheduling",
  outreach: "Outreach",
  interview_invite: "Interview invite",
  operational_update: "Operational update",
  other: "Other",
};

export const PEOPLE_EMAIL_TONE_LABELS: Record<PeopleEmailTone, string> = {
  professional: "Professional",
  warm: "Warm",
  concise: "Concise",
  formal: "Formal",
};
