/**
 * Approval policy — the single source of truth for "auto-send or hard-gate?".
 *
 * Architecture principle #3 (CLAUDE.md): all outbound is approval-gated by policy. Auto-send
 * only low-risk / low-value replies; ALWAYS hard-gate high estimated value or churn risk. This
 * is a pure function so it can be unit-tested and reused everywhere a send decision is made
 * (the send executor's WF3 autopilot path, task 1.5). Never send from a classifier/drafter —
 * they may only consult this to decide whether to enqueue for approval vs. auto-send.
 *
 * Fields come from three tables (see docs/channel_sender.md):
 *   - approval_mode   ← business_profiles.approval_mode ('approval_queue' | 'autopilot')
 *   - estimatedValue  ← leads.estimated_value
 *   - riskType        ← leads.risk_type ('none' | 'churn_risk' | ...)
 *   - riskScore       ← leads.risk_score (0..1)
 *   - confidence      ← reply_drafts.confidence (0..1)
 */

/** Reply is hard-gated (never auto-sent) at or above this estimated value. */
export const HIGH_VALUE_THRESHOLD = 500;

/** Minimum drafter confidence required before a reply may auto-send. */
export const AUTO_SEND_MIN_CONFIDENCE = 0.85;

/** A risk score at or above this is treated as high-risk and hard-gated. */
export const HIGH_RISK_SCORE = 0.8;

export type ApprovalMode = "approval_queue" | "autopilot";

export interface AutoSendInput {
  /** business_profiles.approval_mode. Anything other than 'autopilot' → always gate. */
  approvalMode?: string | null;
  /** leads.estimated_value. */
  estimatedValue?: number | null;
  /** leads.risk_type. 'churn_risk' always hard-gates. */
  riskType?: string | null;
  /** leads.risk_score, 0..1. */
  riskScore?: number | null;
  /** reply_drafts.confidence, 0..1. */
  confidence?: number | null;
  /** business_profiles.high_value_threshold override. */
  highValueThreshold?: number | null;
  /** business_profiles.high_risk_score override (0..1). */
  highRiskScore?: number | null;
}

export interface AutoSendDecision {
  /** True only when the reply is safe to send without a human. */
  autoSend: boolean;
  /** Machine-stable reason code (also human-readable enough for logs). */
  reason:
    | "auto_send_low_risk_low_value"
    | "gated_not_autopilot"
    | "gated_churn_risk"
    | "gated_high_value"
    | "gated_high_risk"
    | "gated_low_confidence";
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Decide whether an approved-eligible reply may auto-send or must be hard-gated to the
 * founder approval queue. Gate checks are evaluated first and win ties — when in doubt, gate.
 */
export function decideAutoSend(input: AutoSendInput): AutoSendDecision {
  const highValueThreshold =
    typeof input.highValueThreshold === "number" && Number.isFinite(input.highValueThreshold)
      ? input.highValueThreshold
      : HIGH_VALUE_THRESHOLD;
  const highRiskScore =
    typeof input.highRiskScore === "number" && Number.isFinite(input.highRiskScore)
      ? input.highRiskScore
      : HIGH_RISK_SCORE;

  // Hard gates first — these override autopilot entirely.
  if (String(input.riskType ?? "") === "churn_risk") {
    return { autoSend: false, reason: "gated_churn_risk" };
  }
  if (num(input.estimatedValue) >= highValueThreshold) {
    return { autoSend: false, reason: "gated_high_value" };
  }
  if (num(input.riskScore) >= highRiskScore) {
    return { autoSend: false, reason: "gated_high_risk" };
  }

  // Only autopilot tenants may auto-send at all.
  if (String(input.approvalMode ?? "") !== "autopilot") {
    return { autoSend: false, reason: "gated_not_autopilot" };
  }

  // Autopilot + low-risk + low-value still requires drafter confidence.
  if (num(input.confidence) < AUTO_SEND_MIN_CONFIDENCE) {
    return { autoSend: false, reason: "gated_low_confidence" };
  }

  return { autoSend: true, reason: "auto_send_low_risk_low_value" };
}
