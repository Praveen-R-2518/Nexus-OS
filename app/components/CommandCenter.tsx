// app/components/CommandCenter.tsx

'use client';

import { useRealtimeConversations, useRealtimeLeads } from '@/app/hooks/useRealtimeData';

export default function CommandCenter() {
  const { conversations } = useRealtimeConversations();
  const { leads } = useRealtimeLeads();

  // Calculate metrics from real data
  const revenueAtRisk = leads
    .filter((l) => l.status === 'pending' || l.status === 'at_risk')
    .reduce((sum, l) => sum + (l.estimated_value || 0), 0);

  const hotLeads = leads.filter((l) => l.urgency === 'high').length;

  const churnRisks = leads.filter((l) => l.risk_score > 70).length;

  const hoursSaved = (conversations.length * 0.15).toFixed(1); // ~9 min per conversation

  return (
    <div className="min-h-screen bg-black p-8">
      {/* Header Row with Title and Demo Button */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h1 className="text-4xl font-bold text-white">Command Center</h1>
        </div>
      </div>

      {/* Subtitle */}
      <p className="text-gray-400 text-sm mb-8">
        Live revenue rescue ops. Prioritize revenue at risk, route hot leads, and intercept churn
        before it lands.
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {/* Revenue at Risk */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold">REVENUE AT RISK</span>
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 17h8m0 0V9m0 8l-8-8-4 4m0 0L3 5m0 0v8m0-8l4 4"
              />
            </svg>
          </div>
          <p className="text-4xl font-bold text-white mb-2">
            ${(revenueAtRisk / 1000).toFixed(0)}k
          </p>
          <p className="text-gray-500 text-sm">in unresolved conversations</p>
        </div>

        {/* Hot Leads */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold">HOT LEADS</span>
            <svg
              className="w-5 h-5 text-orange-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </div>
          <p className="text-4xl font-bold text-white mb-2">{hotLeads}</p>
          <p className="text-gray-500 text-sm">high-intent buyers right now</p>
        </div>

        {/* Churn Risks */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold">CHURN RISKS</span>
            <svg
              className="w-5 h-5 text-yellow-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4v2m0 6H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2h-4.5"
              />
            </svg>
          </div>
          <p className="text-4xl font-bold text-ref-cta dark:text-muted mb-2">{churnRisks}</p>
          <p className="text-gray-500 text-sm">customers showing churn signals</p>
        </div>

        {/* Hours Saved */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold">HOURS SAVED</span>
            <svg
              className="w-5 h-5 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-4xl font-bold text-ref-cta dark:text-muted mb-2">{hoursSaved}h</p>
          <p className="text-gray-500 text-sm">saved by AI drafting</p>
        </div>
      </div>

      {/* Live Inbox and Sections */}
      <div className="grid grid-cols-2 gap-6">
        {/* Live Inbox */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              LIVE INBOX
              <span className="w-2 h-2 rounded-full bg-white/50 animate-pulse"></span>
            </h2>
            <a href="/inbox" className="text-gray-400 text-sm hover:underline">
              Open inbox →
            </a>
          </div>

          {conversations.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">
              No messages yet. Click demo button above to send a test message.
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {conversations.slice(0, 5).map((conv) => {
                const lead = leads.find((l) => l.conversation_id === conv.id);
                return (
                  <div
                    key={conv.id}
                    className="flex items-start justify-between p-3 bg-gray-800 rounded hover:bg-gray-750 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white text-sm truncate">{conv.sender}</p>
                      <p className="text-gray-400 text-xs truncate">{conv.text}</p>
                      {lead && (
                        <div className="flex gap-2 mt-2">
                          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                            ${lead.estimated_value}
                          </span>
                          <span className="text-xs bg-yellow-900 text-yellow-200 px-2 py-1 rounded">
                            Risk {lead.risk_score}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-gray-500 text-xs whitespace-nowrap ml-2">
                      now
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hot Leads & Churn Risks */}
        <div className="space-y-6">
          {/* Hot Leads */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-orange-500">🔥</span> Hot Leads
              </h3>
              <a href="#" className="text-orange-400 text-sm hover:underline">
                View all →
              </a>
            </div>
            {leads.filter((l) => l.urgency === 'high').length === 0 ? (
              <p className="text-gray-500 text-sm py-6">No hot leads in the current snapshot.</p>
            ) : (
              <div className="space-y-2">
                {leads
                  .filter((l) => l.urgency === 'high')
                  .map((lead) => (
                    <div key={lead.id} className="p-2 bg-gray-800 rounded text-sm">
                      <p className="font-medium text-white">{lead.company_name}</p>
                      <p className="text-gray-300">${lead.estimated_value}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Churn Risks */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="text-yellow-500">⚠️</span> Churn Risks
              </h3>
              <a href="#" className="text-yellow-400 text-sm hover:underline">
                View all →
              </a>
            </div>
            {leads.filter((l) => l.risk_score > 70).length === 0 ? (
              <p className="text-gray-500 text-sm py-6">No churn signals in the current snapshot.</p>
            ) : (
              <div className="space-y-2">
                {leads
                  .filter((l) => l.risk_score > 70)
                  .map((lead) => (
                    <div key={lead.id} className="p-2 bg-gray-800 rounded text-sm">
                      <p className="font-medium text-white">{lead.company_name}</p>
                      <p className="text-red-400">Risk Score: {lead.risk_score}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
