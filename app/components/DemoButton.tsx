// app/components/DemoButton.tsx

'use client';

import { useState, useRef, useEffect } from 'react';

type DemoUrgency = 'critical' | 'high' | 'medium' | 'low';
type DemoIntent =
  | 'purchase'
  | 'complaint'
  | 'churn_risk'
  | 'support'
  | 'unknown';

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
  const [status, setStatus] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Test messages with realistic data
  const testMessages: DemoMessage[] = [
    {
      name: 'Kasun Hotel - High Value',
      description: 'Hotel ecommerce inquiry',
      sender: 'kasun@hotelcorp.lk',
      text: 'Hi, we run a hotel group with 5 properties. Looking for an ecommerce platform to manage bookings and merchandise sales. Currently doing ~350,000 LKR monthly. Can you help us build something scalable?',
      value: 350000,
      urgency: 'high',
      intent: 'purchase',
      riskScore: 62,
      confidence: 0.88,
    },
    {
      name: 'Angry Customer - Churn Risk',
      description: 'Dissatisfied customer',
      sender: 'john@ecommerce.com',
      text: 'Your service has been terrible lately. Multiple issues with our store, zero response from support. We\'re seriously considering switching to your competitor. This is our last chance to fix this.',
      value: 50000,
      urgency: 'critical',
      intent: 'churn_risk',
      riskScore: 92,
      confidence: 0.91,
    },
    {
      name: 'Support Question - Low Priority',
      description: 'General inquiry',
      sender: 'sarah@startup.io',
      text: 'Hi, I\'ve been trying to reset my password but the email isn\'t arriving. Can someone help me with this?',
      value: 10000,
      urgency: 'low',
      intent: 'support',
      riskScore: 18,
      confidence: 0.82,
    },
    {
      name: 'Follow-up Proposal - Medium',
      description: 'Warm lead revisit',
      sender: 'rajesh@tech.com',
      text: 'Thanks for the proposal last week. We loved the features but had a few questions about pricing and implementation timeline. Can we schedule a call to discuss?',
      value: 200000,
      urgency: 'medium',
      intent: 'purchase',
      riskScore: 48,
      confidence: 0.86,
    },
    {
      name: 'Mobile App Dev - High Value',
      description: 'App development inquiry',
      sender: 'maya@startupfund.lk',
      text: 'We\'re launching a new fintech app and need a team to handle frontend development and infrastructure. Budget is ~3-5 million LKR for the first phase. Are you available?',
      value: 5000000,
      urgency: 'high',
      intent: 'purchase',
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
      
      // Clear status after 4 seconds
      setTimeout(() => setStatus(''), 4000);
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setStatus(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      {/* Main Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
      >
        <span>Demo Messages</span>
        <svg
          className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="absolute right-0 mt-2 w-96 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50">
          <div className="p-4 border-b border-gray-700">
            <p className="text-sm text-gray-400">Click to send a test message through the system</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {testMessages.map((msg, idx) => (
              <button
                key={idx}
                onClick={() => sendTestMessage(msg)}
                disabled={loading}
                className="w-full text-left px-4 py-3 hover:bg-gray-800 disabled:opacity-50 border-b border-gray-800 last:border-b-0 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{msg.name}</p>
                    <p className="text-gray-400 text-xs truncate">{msg.description}</p>
                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">{msg.text.substring(0, 60)}...</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        msg.urgency === 'critical'
                          ? 'bg-red-900 text-red-200'
                          : msg.urgency === 'high'
                          ? 'bg-orange-900 text-orange-200'
                          : msg.urgency === 'medium'
                          ? 'bg-yellow-900 text-yellow-200'
                          : 'bg-gray-700 text-gray-200'
                      }`}
                    >
                      {msg.urgency}
                    </span>
                    <span className="text-xs text-green-400 font-medium">
                      ${(msg.value / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="p-3 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
            Messages flow through: WF1 (intake) -> WF2 (classify) -> WF3 (draft) -> Supabase
          </div>
        </div>
      )}

      {/* Status Message */}
      {status && (
        <div
          className={`absolute top-full mt-2 right-0 px-3 py-2 rounded text-sm whitespace-nowrap ${
            status.startsWith("Error:")
              ? "bg-red-900 text-red-200"
              : status.startsWith("Sending:")
                ? "bg-blue-900 text-blue-200"
                : "bg-green-900 text-green-200"
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
}
