/**
 * Unit tests for lib/approval-policy.ts (pure function; no DB/network).
 * Run: npx tsx scripts/approval_policy.test.ts  (or `npm run test:approval-policy`)
 *
 * Proves the auto-send policy per architecture principle #3: auto-send only low-risk/low-value
 * autopilot replies with high confidence; hard-gate everything else (churn, high value, high
 * risk, non-autopilot, low confidence). Gate checks win over autopilot.
 */

import {
  decideAutoSend,
  AUTO_SEND_MIN_CONFIDENCE,
  HIGH_VALUE_THRESHOLD,
  HIGH_RISK_SCORE,
} from "@/lib/approval-policy";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// The happy path: autopilot, low value, low risk, high confidence → auto-send.
const AUTOPILOT_SAFE = {
  approvalMode: "autopilot",
  estimatedValue: 50,
  riskType: "none",
  riskScore: 0.1,
  confidence: 0.95,
};

check("autopilot + low-risk + low-value + high confidence auto-sends", () => {
  const d = decideAutoSend(AUTOPILOT_SAFE);
  assert(d.autoSend === true, "should auto-send");
  assert(d.reason === "auto_send_low_risk_low_value", `reason was ${d.reason}`);
});

check("churn_risk always gates, even on autopilot", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, riskType: "churn_risk" });
  assert(d.autoSend === false, "must gate churn risk");
  assert(d.reason === "gated_churn_risk", `reason was ${d.reason}`);
});

check("estimated value at threshold gates (boundary is inclusive)", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, estimatedValue: HIGH_VALUE_THRESHOLD });
  assert(d.autoSend === false, "must gate at threshold");
  assert(d.reason === "gated_high_value", `reason was ${d.reason}`);
});

check("value just under threshold does not gate on value", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, estimatedValue: HIGH_VALUE_THRESHOLD - 1 });
  assert(d.autoSend === true, "just-under threshold should still auto-send");
});

check("high risk score gates", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, riskScore: HIGH_RISK_SCORE });
  assert(d.autoSend === false, "must gate high risk score");
  assert(d.reason === "gated_high_risk", `reason was ${d.reason}`);
});

check("non-autopilot always gates even when safe", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, approvalMode: "approval_queue" });
  assert(d.autoSend === false, "approval_queue must gate");
  assert(d.reason === "gated_not_autopilot", `reason was ${d.reason}`);
});

check("missing approval mode defaults to gate", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, approvalMode: null });
  assert(d.autoSend === false, "null mode must gate");
  assert(d.reason === "gated_not_autopilot", `reason was ${d.reason}`);
});

check("confidence below minimum gates", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, confidence: AUTO_SEND_MIN_CONFIDENCE - 0.01 });
  assert(d.autoSend === false, "low confidence must gate");
  assert(d.reason === "gated_low_confidence", `reason was ${d.reason}`);
});

check("confidence exactly at minimum auto-sends (boundary inclusive)", () => {
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, confidence: AUTO_SEND_MIN_CONFIDENCE });
  assert(d.autoSend === true, "confidence == min should auto-send");
});

check("gate precedence: churn risk beats a satisfied autopilot path", () => {
  // Even with a huge value AND churn, the first hard gate (churn) is the reported reason.
  const d = decideAutoSend({ ...AUTOPILOT_SAFE, riskType: "churn_risk", estimatedValue: 9999 });
  assert(d.reason === "gated_churn_risk", `churn should win, got ${d.reason}`);
});

check("empty input gates (safe default)", () => {
  const d = decideAutoSend({});
  assert(d.autoSend === false, "empty input must gate");
  assert(d.reason === "gated_not_autopilot", `reason was ${d.reason}`);
});

check("tenant high_value_threshold override gates at custom boundary", () => {
  const d = decideAutoSend({
    ...AUTOPILOT_SAFE,
    estimatedValue: 300,
    highValueThreshold: 300,
  });
  assert(d.autoSend === false, "custom threshold must gate");
  assert(d.reason === "gated_high_value", `reason was ${d.reason}`);
});

check("tenant high_risk_score override gates at custom boundary", () => {
  const d = decideAutoSend({
    ...AUTOPILOT_SAFE,
    riskScore: 0.6,
    highRiskScore: 0.6,
  });
  assert(d.autoSend === false, "custom risk score must gate");
  assert(d.reason === "gated_high_risk", `reason was ${d.reason}`);
});

console.log(`\napproval-policy: ${passed} checks passed`);
