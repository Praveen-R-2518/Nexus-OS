import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Lead ingest stub is disabled" },
    { status: 410 },
  );
}
