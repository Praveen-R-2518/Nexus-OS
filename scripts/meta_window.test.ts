/**
 * Unit tests for lib/meta/window.ts + lib/meta/send.ts (pure; no DB/network).
 * Run: npx tsx scripts/meta_window.test.ts  (or `npm run test:meta-window`)
 *
 * Proves the Meta messaging-window policy (checklist 1.7 groundwork): free-form only inside 24h;
 * WhatsApp falls back to a template outside 24h; Messenger/IG need the HUMAN_AGENT tag (≤7d, and
 * only when enabled) else blocked. Also proves the Graph request builder shapes and that live
 * sending stays DISABLED.
 */

import {
  chooseSendStrategy,
  withinServiceWindow,
  msSinceLastInbound,
  SERVICE_WINDOW_MS,
  HUMAN_AGENT_WINDOW_MS,
} from "@/lib/meta/window";
import { buildMetaSendRequest, sendMetaMessage, MetaSendError } from "@/lib/meta/send";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  const done = () => {
    passed += 1;
    console.log(`  ok  ${name}`);
  };
  const r = fn();
  if (r instanceof Promise) return r.then(done);
  done();
}

const NOW = new Date("2026-07-13T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

// --- window math ---------------------------------------------------------------
check("msSinceLastInbound returns null for missing/invalid timestamps", () => {
  assert(msSinceLastInbound(null, NOW) === null, "null → null");
  assert(msSinceLastInbound(undefined, NOW) === null, "undefined → null");
  assert(msSinceLastInbound("not-a-date", NOW) === null, "garbage → null");
});

check("msSinceLastInbound clamps future timestamps to 0", () => {
  assert(msSinceLastInbound(hoursAgo(-5), NOW) === 0, "future → 0");
});

check("withinServiceWindow true just inside 24h, false just outside", () => {
  assert(withinServiceWindow(hoursAgo(23), NOW) === true, "23h inside");
  assert(withinServiceWindow(hoursAgo(25), NOW) === false, "25h outside");
  assert(withinServiceWindow(null, NOW) === false, "unknown → outside");
});

// --- strategy: inside window (all channels) ------------------------------------
for (const platform of ["whatsapp", "facebook", "instagram"] as const) {
  check(`${platform}: inside 24h → session_text`, () => {
    const s = chooseSendStrategy({ platform, lastInboundAt: hoursAgo(1), now: NOW });
    assert(s.kind === "session_text", `got ${s.kind}`);
  });
}

// --- strategy: WhatsApp outside window → template ------------------------------
check("whatsapp: outside 24h → template", () => {
  const s = chooseSendStrategy({ platform: "whatsapp", lastInboundAt: hoursAgo(48), now: NOW });
  assert(s.kind === "template", `got ${s.kind}`);
});

check("whatsapp: unknown last-inbound → template (always allowed)", () => {
  const s = chooseSendStrategy({ platform: "whatsapp", lastInboundAt: null, now: NOW });
  assert(s.kind === "template", `got ${s.kind}`);
});

// --- strategy: Messenger/IG outside window ------------------------------------
check("facebook: 48h + human agent enabled → human_agent_tag", () => {
  const s = chooseSendStrategy({
    platform: "facebook",
    lastInboundAt: hoursAgo(48),
    now: NOW,
    humanAgentEnabled: true,
  });
  assert(s.kind === "human_agent_tag", `got ${s.kind}`);
});

check("facebook: 48h but human agent NOT enabled → blocked", () => {
  const s = chooseSendStrategy({ platform: "facebook", lastInboundAt: hoursAgo(48), now: NOW });
  assert(s.kind === "blocked", `got ${s.kind}`);
});

check("instagram: beyond 7d even with human agent → blocked", () => {
  const s = chooseSendStrategy({
    platform: "instagram",
    lastInboundAt: hoursAgo(24 * 8),
    now: NOW,
    humanAgentEnabled: true,
  });
  assert(s.kind === "blocked", `got ${s.kind}`);
});

check("messenger/IG: unknown last-inbound → blocked (cannot verify window)", () => {
  const s = chooseSendStrategy({ platform: "facebook", lastInboundAt: null, now: NOW });
  assert(s.kind === "blocked", `got ${s.kind}`);
});

// sanity: the two windows are ordered as documented
check("HUMAN_AGENT_WINDOW_MS is 7× larger than SERVICE_WINDOW_MS", () => {
  assert(HUMAN_AGENT_WINDOW_MS === SERVICE_WINDOW_MS * 7, "7-day vs 24h");
});

// --- request builders ----------------------------------------------------------
check("whatsapp session_text builds a text message body", () => {
  const req = buildMetaSendRequest({
    platform: "whatsapp",
    senderId: "PHONE_NUMBER_ID",
    recipientId: "15551234567",
    text: "Thanks for your message!",
    strategy: { kind: "session_text" },
  });
  assert(req.url.endsWith("/PHONE_NUMBER_ID/messages"), `url ${req.url}`);
  assert(req.body.messaging_product === "whatsapp", "messaging_product");
  assert(req.body.type === "text", "type text");
  assert((req.body.text as { body: string }).body === "Thanks for your message!", "text body");
});

check("whatsapp template builds a template body with language code", () => {
  const req = buildMetaSendRequest({
    platform: "whatsapp",
    senderId: "PN",
    recipientId: "15551234567",
    text: "ignored for template",
    strategy: { kind: "template" },
    template: { name: "reengage", languageCode: "en_US" },
  });
  assert(req.body.type === "template", "type template");
  const tpl = req.body.template as { name: string; language: { code: string } };
  assert(tpl.name === "reengage", "template name");
  assert(tpl.language.code === "en_US", "language code");
});

check("whatsapp template strategy without a template throws", () => {
  let threw = false;
  try {
    buildMetaSendRequest({
      platform: "whatsapp",
      senderId: "PN",
      recipientId: "1",
      text: "x",
      strategy: { kind: "template" },
    });
  } catch (e) {
    threw = e instanceof MetaSendError && e.status === 400;
  }
  assert(threw, "should throw MetaSendError(400)");
});

check("messenger session_text uses RESPONSE messaging_type + recipient id", () => {
  const req = buildMetaSendRequest({
    platform: "facebook",
    senderId: "PAGE_ID",
    recipientId: "PSID123",
    text: "hi",
    strategy: { kind: "session_text" },
  });
  assert(req.url.endsWith("/PAGE_ID/messages"), `url ${req.url}`);
  assert(req.body.messaging_type === "RESPONSE", "messaging_type");
  assert((req.body.recipient as { id: string }).id === "PSID123", "recipient id");
});

check("messenger human_agent_tag uses MESSAGE_TAG + HUMAN_AGENT", () => {
  const req = buildMetaSendRequest({
    platform: "facebook",
    senderId: "PAGE_ID",
    recipientId: "PSID123",
    text: "following up",
    strategy: { kind: "human_agent_tag" },
  });
  assert(req.body.messaging_type === "MESSAGE_TAG", "messaging_type tag");
  assert(req.body.tag === "HUMAN_AGENT", "HUMAN_AGENT tag");
});

check("building a request for an impossible strategy throws", () => {
  let threw = false;
  try {
    buildMetaSendRequest({
      platform: "whatsapp",
      senderId: "PN",
      recipientId: "1",
      text: "x",
      strategy: { kind: "human_agent_tag" },
    });
  } catch (e) {
    threw = e instanceof MetaSendError;
  }
  assert(threw, "whatsapp + human_agent_tag should throw");
});

// --- live sending stays disabled ----------------------------------------------
const pending = check("sendMetaMessage is DISABLED (throws 501)", async () => {
  let threw = false;
  try {
    await sendMetaMessage({
      platform: "whatsapp",
      senderId: "PN",
      recipientId: "1",
      text: "should not send",
      strategy: { kind: "session_text" },
    });
  } catch (e) {
    threw = e instanceof MetaSendError && e.status === 501;
  }
  assert(threw, "must throw MetaSendError(501) — live sending not enabled");
});

Promise.resolve(pending).then(() => {
  console.log(`\n${passed} checks passed`);
});
