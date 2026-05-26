"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type DemoUrgency = "critical" | "high" | "medium" | "low";
type DemoIntent =
  | "purchase"
  | "complaint"
  | "churn_risk"
  | "support"
  | "unknown";

type DemoMessage = {
  name: string;
  description: string;
  sender: string;
  text: string;
  value: number;
  urgency: DemoUrgency;
  intent: DemoIntent;
  riskScore: number;
  confidence: number;
};

type DemoButtonProps = {
  onSent?: () => void | Promise<void>;
};

export default function DemoButton({ onSent }: DemoButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const testMessages: DemoMessage[] = [
    {
      name: "Kasun Hotel - High Value",
      description: "Hotel ecommerce inquiry",
      sender: "kasun@hotelcorp.lk",
      text: "Hi, we run a hotel group with 5 properties. Looking for an ecommerce platform to manage bookings and merchandise sales. Currently doing ~350,000 LKR monthly. Can you help us build something scalable?",
      value: 350000,
      urgency: "high",
      intent: "purchase",
      riskScore: 62,
      confidence: 0.88,
    },
    {
      name: "Angry Customer - Churn Risk",
      description: "Dissatisfied customer",
      sender: "john@ecommerce.com",
      text: "Your service has been terrible lately. Multiple issues with our store, zero response from support. We're seriously considering switching to your competitor. This is our last chance to fix this.",
      value: 50000,
      urgency: "critical",
      intent: "churn_risk",
      riskScore: 92,
      confidence: 0.91,
    },
    {
      name: "Support Question - Low Priority",
      description: "General inquiry",
      sender: "sarah@startup.io",
      text: "Hi, I've been trying to reset my password but the email isn't arriving. Can someone help me with this?",
      value: 10000,
      urgency: "low",
      intent: "support",
      riskScore: 18,
      confidence: 0.82,
    },
    {
      name: "Follow-up Proposal - Medium",
      description: "Warm lead revisit",
      sender: "rajesh@tech.com",
      text: "Thanks for the proposal last week. We loved the features but had a few questions about pricing and implementation timeline. Can we schedule a call to discuss?",
      value: 200000,
      urgency: "medium",
      intent: "purchase",
      riskScore: 48,
      confidence: 0.86,
    },
    {
      name: "Mobile App Dev - High Value",
      description: "App development inquiry",
      sender: "maya@startupfund.lk",
      text: "We're launching a new fintech app and need a team to handle frontend development and infrastructure. Budget is ~3-5 million LKR for the first phase. Are you available?",
      value: 5000000,
      urgency: "high",
      intent: "purchase",
      riskScore: 74,
      confidence: 0.89,
    },
  ];

  function parseResponseJson(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  function errorMessageFromBody(
    parsed: unknown,
    fallbackText: string,
    statusText: string,
  ): string {
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
      if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    }
    if (fallbackText.trim()) return fallbackText.trim().slice(0, 500);
    return statusText || "Request failed";
  }

  const sendTestMessage = async (message: DemoMessage) => {
    setLoading(true);
    setStatus(`Sending: "${message.name}"...`);
    setShowMenu(false);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.text,
          customer_email: message.sender,
          customer_name: message.name,
          channel: "email",
          source: "demo",
          status: "unread",
          intent: message.intent,
          urgency: message.urgency,
          estimated_value: message.value,
          risk_score: message.riskScore,
          confidence: message.confidence,
          raw_payload: {
            demo: true,
            testLabel: message.name,
            estimatedValue: message.value,
            urgency: message.urgency,
            intent: message.intent,
            timestamp: new Date().toISOString(),
            businessProfile: "silva-digital-agency",
          },
        }),
      });

      const responseText = await response.text();
      const parsed = parseResponseJson(responseText);

      if (!response.ok) {
        throw new Error(
          errorMessageFromBody(parsed, responseText, response.statusText),
        );
      }

      void onSent?.();

      setStatus(`"${message.name}" sent. Watch the dashboard update.`);

      window.setTimeout(() => setStatus(""), 4000);
    } catch (error) {
      console.error("Error:", error);
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      window.setTimeout(() => setStatus(""), 4000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-border bg-ref-cta px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-[#f4f8fc] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-[#153d5c]"
      >
        <Send className="h-4 w-4 shrink-0" aria-hidden />
        <span>Demo</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-interaction",
            showMenu && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {showMenu ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,24rem)] border border-border bg-white shadow-sm dark:border-border dark:bg-surface-card">
          <div className="hairline-b px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Inject test payload
            </p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-atmospheric-grey">
              Sends a conversation through intake → classify → draft.
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto overscroll-contain">
            {testMessages.map((msg, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendTestMessage(msg)}
                disabled={loading}
                className="flex w-full cursor-pointer hairline-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-ref-mint disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-surface-elevated"
              >
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold text-atmospheric-grey">
                      {msg.name}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted">
                      {msg.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
                        msg.urgency === "critical" &&
                          "border-status-critical-border bg-status-critical-surface text-status-critical",
                        msg.urgency === "high" &&
                          "border-status-warning-border bg-status-warning-surface text-status-warning",
                        msg.urgency === "medium" &&
                          "border-status-caution-border bg-status-caution-surface text-status-caution",
                        msg.urgency === "low" &&
                          "border-status-positive-border bg-status-positive-surface text-status-positive",
                      )}
                    >
                      {msg.urgency}
                    </span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums text-ref-cta dark:text-sky-300/90">
                      ${(msg.value / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-dashed border-border/70 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-muted dark:border-border">
            WF1 → WF2 → WF3 → Supabase
          </div>
        </div>
      ) : null}

      {status ? (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 max-w-[min(100vw-2rem,20rem)] border px-3 py-2 font-mono text-[10px] leading-snug",
            status.startsWith("Error:")
              ? "border-status-critical-border bg-status-critical-surface text-status-critical"
              : status.startsWith("Sending:")
                ? "border-status-neutral-border bg-status-neutral-surface text-status-neutral"
                : "border-status-positive-border bg-status-positive-surface text-status-positive",
          )}
          role="status"
        >
          {status}
        </div>
      ) : null}
    </div>
  );
}
