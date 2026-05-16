import { NextResponse } from "next/server";
import type { ReplyDraft } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const data: ReplyDraft[] = [];
  const filtered =
    status && status.length > 0
      ? data.filter((d) => d.approval_status === status)
      : data;

  return NextResponse.json({ data: filtered });
}
