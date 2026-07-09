import { handleGmailOAuthCallback } from "@/app/api/gmail/callback/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGmailOAuthCallback(request);
}
