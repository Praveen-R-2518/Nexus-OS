import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true });
}
