/**
 * Seed a realistic DEMO inbox (conversations + leads + reply_drafts) for one workspace so the
 * Revenue Analyst chat agent can be built / demoed before live Gmail + Meta intake exist
 * (both are domain-blocked in beta — see docs/NEXUS_REBUILD_CONTEXT.md §5).
 *
 * Usage (from repo root):
 *   npm run seed:demo <workspace_id>
 *   npm run seed:demo <workspace_id> -- --teardown
 *
 * DEMO-ONLY + IDEMPOTENT: every seeded row is tagged with raw_payload.seed = "analyst-demo-v1".
 * Re-running first deletes the prior seed for this tenant, then re-inserts — so it never
 * duplicates. `--teardown` deletes the seed and exits. Tenant-scoped: only touches the given
 * workspace's team. Requires SUPABASE_SERVICE_ROLE_KEY (service role, bypasses RLS) — never ship
 * this to a client bundle; it is a server-side script.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createServerClient } from "@/lib/supabase";

const SEED_MARKER = "analyst-demo-v1";

type DemoRow = {
  source: "gmail" | "whatsapp" | "instagram" | "facebook" | "email";
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  message: string;
  intent: "purchase" | "complaint" | "churn_risk" | "support";
  urgency: "critical" | "high" | "medium" | "low";
  estimated_value: number;
  risk_score: number;
  status: "new" | "classified" | "draft_ready";
  confidence: number;
  /** When set, also seed a lead + a pending reply_draft for this conversation. */
  draft?: string;
};

const DEMO_ROWS: DemoRow[] = [
  {
    source: "whatsapp",
    customer_name: "Jordan Rivera",
    customer_phone: "15551234567",
    message:
      "Hi — is the downtown 2-bed unit still available? Ready to put down a deposit this week if so.",
    intent: "purchase",
    urgency: "high",
    estimated_value: 4200,
    risk_score: 18,
    status: "draft_ready",
    confidence: 0.92,
    draft:
      "Hi Jordan — yes, the downtown 2-bed is still available. I can hold it with a deposit today; want me to send the link?",
  },
  {
    source: "gmail",
    customer_name: "Priya Nair",
    customer_email: "priya@example.com",
    message:
      "We've been on the Pro plan for a year but the recent outages have us seriously considering leaving. Can someone call me?",
    intent: "churn_risk",
    urgency: "critical",
    estimated_value: 9000,
    risk_score: 88,
    status: "classified",
    confidence: 0.87,
    draft:
      "Priya, I'm sorry about the disruption — that's not the experience we want for a year-long Pro customer. I'd like to call you today; what time works?",
  },
  {
    source: "instagram",
    customer_name: "Marcus Lee",
    message:
      "Do you ship internationally? Looking to order 3 of the large bundles for my studio.",
    intent: "purchase",
    urgency: "medium",
    estimated_value: 1500,
    risk_score: 22,
    status: "classified",
    confidence: 0.81,
    draft:
      "Hi Marcus — yes, we ship internationally. Three large bundles qualifies for our studio discount; I can put a quote together now.",
  },
  {
    source: "gmail",
    customer_name: "Dana Whitfield",
    customer_email: "dana@example.com",
    message:
      "The invoice I received doesn't match the quote. Can you clarify the extra $200 line item?",
    intent: "complaint",
    urgency: "high",
    estimated_value: 200,
    risk_score: 54,
    status: "new",
    confidence: 0.76,
  },
  {
    source: "facebook",
    customer_name: "Sam Okafor",
    message: "What are your opening hours this weekend?",
    intent: "support",
    urgency: "low",
    estimated_value: 0,
    risk_score: 6,
    status: "new",
    confidence: 0.7,
  },
  {
    source: "whatsapp",
    customer_name: "Elena Torres",
    customer_phone: "15557654321",
    message:
      "Loved the demo! Sending this to our ops lead — we'd want the team tier for ~15 seats. What's pricing?",
    intent: "purchase",
    urgency: "high",
    estimated_value: 7200,
    risk_score: 12,
    status: "draft_ready",
    confidence: 0.9,
    draft:
      "Elena, thrilled you liked it! For ~15 seats you'd be on the Team tier — I'll send a tailored quote and a link to loop in your ops lead.",
  },
];

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const teardown = args.includes("--teardown");
  const workspaceId = args.find((a) => !a.startsWith("-"))?.trim();

  if (!workspaceId) {
    fail(
      "Missing <workspace_id>. Usage: npm run seed:demo <workspace_id> [-- --teardown]",
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    fail("SUPABASE_SERVICE_ROLE_KEY is not set (needed to seed demo data).");
  }

  const supabase = createServerClient();

  // Resolve tenant from the workspace (defensive — never write across tenants).
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, team_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsErr) fail(`Workspace lookup failed: ${wsErr.message}`);
  if (!ws) fail(`No workspace found with id ${workspaceId}`);
  const teamId = (ws as { team_id?: string | null }).team_id ?? null;
  if (!teamId) fail(`Workspace ${workspaceId} has no team_id.`);

  // Idempotency / teardown: clear any prior seed for THIS tenant first.
  const { data: existing, error: existErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("team_id", teamId)
    .filter("raw_payload->>seed", "eq", SEED_MARKER);
  if (existErr) fail(`Could not read existing seed rows: ${existErr.message}`);

  const existingIds = (existing ?? []).map((r) => (r as { id: string }).id);
  if (existingIds.length > 0) {
    await supabase.from("reply_drafts").delete().in("conversation_id", existingIds);
    await supabase.from("leads").delete().in("conversation_id", existingIds);
    await supabase.from("conversations").delete().in("id", existingIds);
    console.log(`Cleared ${existingIds.length} previous demo conversation(s).`);
  }

  if (teardown) {
    console.log(`✓ Teardown complete for workspace ${workspaceId}.`);
    return;
  }

  let conversations = 0;
  let leads = 0;
  let drafts = 0;

  for (const row of DEMO_ROWS) {
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        team_id: teamId,
        workspace_id: workspaceId,
        source: row.source,
        customer_name: row.customer_name,
        customer_email: row.customer_email ?? "",
        customer_phone: row.customer_phone ?? null,
        channel: row.source,
        message: row.message,
        intent: row.intent,
        urgency: row.urgency,
        estimated_value: row.estimated_value,
        revenue_at_risk: row.estimated_value,
        risk_score: row.risk_score,
        confidence: row.confidence,
        status: row.status,
        raw_payload: { seed: SEED_MARKER, demo: true },
      })
      .select("id")
      .single();

    if (convErr || !conv) {
      fail(`Failed to insert demo conversation (${row.customer_name}): ${convErr?.message}`);
    }
    const conversationId = (conv as { id: string }).id;
    conversations += 1;

    if (!row.draft) continue;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .insert({
        team_id: teamId,
        workspace_id: workspaceId,
        conversation_id: conversationId,
        customer_name: row.customer_name,
        customer_email: row.customer_email ?? "",
        intent: row.intent,
        urgency: row.urgency,
        estimated_value: row.estimated_value,
        risk_type: row.intent === "churn_risk" ? "churn" : "none",
        risk_score: row.risk_score,
        status: "new",
        next_action: "request_approval",
        confidence: row.confidence,
      })
      .select("id")
      .single();

    if (leadErr || !lead) {
      fail(`Failed to insert demo lead (${row.customer_name}): ${leadErr?.message}`);
    }
    leads += 1;

    const { error: draftErr } = await supabase.from("reply_drafts").insert({
      team_id: teamId,
      workspace_id: workspaceId,
      lead_id: (lead as { id: string }).id,
      conversation_id: conversationId,
      draft_text: row.draft,
      status: "pending_approval",
      approval_status: "pending",
      confidence: row.confidence,
    });
    if (draftErr) {
      fail(`Failed to insert demo reply_draft (${row.customer_name}): ${draftErr.message}`);
    }
    drafts += 1;
  }

  console.log(
    `\n✓ Seeded demo inbox for workspace ${workspaceId}:` +
      `\n  conversations: ${conversations}` +
      `\n  leads:         ${leads}` +
      `\n  reply_drafts:  ${drafts} (pending approval)` +
      `\n\nOpen /chat and ask "What's at risk today?" to see the analyst work.\n`,
  );
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
