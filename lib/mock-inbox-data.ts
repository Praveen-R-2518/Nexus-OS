import type { Conversation, ReplyDraft } from "@/types";

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    source: "email",
    customer_name: "Acme Corp",
    customer_email: "buyer@acme.com",
    raw_message:
      "We're ready to purchase 50 seats if you can match last quarter's pricing.",
    intent: "purchase",
    urgency: "high",
    estimated_value: 12500,
    risk_score: 72,
    confidence: 0.91,
    status: "draft_ready",
    created_at: "2026-05-16T06:00:00.000Z",
    updated_at: "2026-05-16T07:30:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    source: "email",
    customer_name: "Jordan Lee",
    customer_email: "jordan@example.com",
    raw_message:
      "I've been charged twice this month and your dashboard won't let me cancel. This is unacceptable.",
    intent: "complaint",
    urgency: "critical",
    estimated_value: 890,
    risk_score: 88,
    confidence: 0.87,
    status: "classified",
    created_at: "2026-05-16T04:15:00.000Z",
    updated_at: "2026-05-16T04:20:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    source: "chat",
    customer_name: "Skyline Rentals",
    raw_message:
      "We're evaluating alternatives — our contract ends in two weeks unless we see a retention offer.",
    intent: "churn_risk",
    urgency: "critical",
    estimated_value: 42000,
    risk_score: 94,
    confidence: 0.84,
    status: "new",
    created_at: "2026-05-16T02:40:00.000Z",
    updated_at: "2026-05-16T02:40:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    source: "form",
    customer_name: "Dev Patel",
    customer_email: "dev@small.co",
    raw_message:
      "Webhook retries are failing from our side — can someone confirm your incident status page?",
    intent: "support",
    urgency: "medium",
    estimated_value: 2100,
    risk_score: 41,
    confidence: 0.79,
    status: "sent",
    created_at: "2026-05-15T18:00:00.000Z",
    updated_at: "2026-05-16T01:00:00.000Z",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    source: "email",
    customer_name: "Unknown Sender",
    raw_message: "Just checking if you're still in business.",
    intent: "unknown",
    urgency: "low",
    estimated_value: 0,
    risk_score: 12,
    confidence: 0.42,
    status: "new",
    created_at: "2026-05-14T12:00:00.000Z",
    updated_at: "2026-05-14T12:00:00.000Z",
  },
];

export const MOCK_REPLY_DRAFTS: ReplyDraft[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    conversation_id: "11111111-1111-4111-8111-111111111111",
    draft_text:
      "Thanks for reaching out — I can match last quarter's tiered pricing for 50 seats. I'll send the order form shortly.",
    tone: "professional",
    approval_status: "pending",
    created_at: "2026-05-16T07:00:00.000Z",
  },
];
