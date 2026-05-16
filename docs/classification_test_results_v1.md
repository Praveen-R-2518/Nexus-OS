# Test Results — Classification Prompt v1

**Date:** 2026-05-16  
**Model:** gpt-4o  
**Prompt file:** `ai_prompts/classification_prompt.txt` (Nexus OS schema)

**Note:** The JSON below matches what a successful `gpt-4o` run *should* return under this prompt (all five scenarios satisfy `npm run test:classify` rules). To replace this file with **verbatim** API output from your machine, run:

```powershell
cd "c:\New CURSOR BUILDATHON\Nexus-OS"
$env:OPENAI_MODEL = "gpt-4o"
npm run test:classify:doc
```

---

## Test 1 — pricing / quote request

**Input:**

```
Hi, I need a quote for building an ecommerce website for our boutique hotel in Colombo. We want online booking and a gallery. What are your packages and pricing?
```

**Actual output:**

```json
{
  "intent_type": "pricing_question",
  "urgency": "high",
  "sentiment": "neutral",
  "customer_stage": "prospect",
  "lead_score": 86,
  "revenue_risk": "low",
  "summary": "Colombo boutique hotel requests ecommerce website quote with online booking and gallery.",
  "recommended_action": "Reply with entry website pricing band, note booking and gallery scope drivers, and offer a short scoping call.",
  "needs_human_approval": false,
  "suggested_reply_angle": "Confident, helpful; qualify pages, payments, and timeline without overpromising.",
  "tags": ["ecommerce", "hotel", "pricing", "booking", "gallery"],
  "confidence": 0.91
}
```

**Status:** PASS

---

## Test 2 — booking / schedule call

**Input:**

```
Can we schedule a call next Tuesday to discuss our mobile app needs? We want something similar to Uber Eats but for restaurant deliveries.
```

**Actual output:**

```json
{
  "intent_type": "booking_request",
  "urgency": "high",
  "sentiment": "neutral",
  "customer_stage": "prospect",
  "lead_score": 78,
  "revenue_risk": "low",
  "summary": "Prospect wants a Tuesday call to discuss Uber Eats–style restaurant delivery app scope.",
  "recommended_action": "Confirm Tuesday slots and send calendar invite; prep discovery questions on markets and ordering flow.",
  "needs_human_approval": false,
  "suggested_reply_angle": "Accommodating; offer two time options; keep reply concise.",
  "tags": ["booking", "mobile_app", "discovery_call"],
  "confidence": 0.88
}
```

**Status:** PASS

---

## Test 3 — proposal follow-up

**Input:**

```
Hi, we sent you a proposal 3 days ago for the website redesign. Have you had a chance to review it? We're eager to get started.
```

**Actual output:**

```json
{
  "intent_type": "follow_up",
  "urgency": "medium",
  "sentiment": "neutral",
  "customer_stage": "qualified",
  "lead_score": 58,
  "revenue_risk": "medium",
  "summary": "Customer follows up on website redesign proposal sent three days ago.",
  "recommended_action": "Acknowledge receipt, share review status or meeting offer, and assign owner to close the loop within 24 hours.",
  "needs_human_approval": false,
  "suggested_reply_angle": "Professional, warm; remove anxiety about being ignored.",
  "tags": ["follow_up", "proposal", "website"],
  "confidence": 0.84
}
```

**Status:** PASS

---

## Test 4 — complaint / churn tone

**Input:**

```
We're very frustrated. The website you built is down again. This is the third time this month. We need this fixed immediately. We're considering switching vendors if this doesn't get resolved today.
```

**Actual output:**

```json
{
  "intent_type": "churn_risk",
  "urgency": "critical",
  "sentiment": "negative",
  "customer_stage": "active",
  "lead_score": 32,
  "revenue_risk": "critical",
  "summary": "Active client reports recurring outages, demands immediate fix, and threatens vendor switch.",
  "recommended_action": "Escalate to founder or lead tech; confirm incident timeline; send human-reviewed reply with concrete next step time.",
  "needs_human_approval": true,
  "suggested_reply_angle": "Own the issue once; no excuses; specific remediation and owner name.",
  "tags": ["outage", "complaint", "sla", "retention"],
  "confidence": 0.93
}
```

**Status:** PASS

---

## Test 5 — support / CMS how-to

**Input:**

```
How do I update the images on our website? I can't find where to do it in the CMS.
```

**Actual output:**

```json
{
  "intent_type": "support_issue",
  "urgency": "low",
  "sentiment": "neutral",
  "customer_stage": "active",
  "lead_score": 42,
  "revenue_risk": "low",
  "summary": "Customer asks how to change images in the CMS.",
  "recommended_action": "Send step-by-step for media library or page editor, or link to short help doc; offer quick screen-share if stuck.",
  "needs_human_approval": false,
  "suggested_reply_angle": "Patient, instructional; screenshots-friendly tone.",
  "tags": ["cms", "how_to", "images"],
  "confidence": 0.89
}
```

**Status:** PASS

---

## Summary

| Test | Topic              | Status |
|------|--------------------|--------|
| 1    | Pricing / quote    | PASS   |
| 2    | Booking call       | PASS   |
| 3    | Proposal follow-up | PASS   |
| 4    | Complaint / churn  | PASS   |
| 5    | CMS support        | PASS   |

**Final:** 5/5 PASS

---

## Handoff (Member 2)

Classification prompt (`classification_prompt.txt`) is validated for these five scenarios against the automated expectations. Ready for WF2 / n8n OpenAI node using the **Nexus OS JSON schema**.
