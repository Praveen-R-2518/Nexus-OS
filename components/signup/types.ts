export type PlanTier = "starter" | "pro" | "team" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type WorkspaceType = "solo" | "team";

export const SIGNUP_STORAGE_KEY = "nexus-os-signup-state-v1";

export type SignupSnapshot = {
  currentStep: number;
  workspaceId: string | null;
  subscriptionId: string | null;
  companyName: string;
  industry: string;
  companySize: string;
  workspaceType: WorkspaceType;
  teamSize: number;
  teamEmails: string[];
  planTier: PlanTier | null;
  billingCycle: BillingCycle | null;
  gmailConnected: boolean | null;
};

export const defaultSignupSnapshot = (): SignupSnapshot => ({
  currentStep: 1,
  workspaceId: null,
  subscriptionId: null,
  companyName: "",
  industry: "",
  companySize: "",
  workspaceType: "solo",
  teamSize: 2,
  teamEmails: [""],
  planTier: null,
  billingCycle: "monthly",
  gmailConnected: null,
});

export function loadSignupSnapshot(): SignupSnapshot {
  if (typeof window === "undefined") return defaultSignupSnapshot();
  try {
    const raw = sessionStorage.getItem(SIGNUP_STORAGE_KEY);
    if (!raw) return defaultSignupSnapshot();
    const parsed = JSON.parse(raw) as Partial<SignupSnapshot>;
    return { ...defaultSignupSnapshot(), ...parsed };
  } catch {
    return defaultSignupSnapshot();
  }
}

export function saveSignupSnapshot(snapshot: SignupSnapshot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}
