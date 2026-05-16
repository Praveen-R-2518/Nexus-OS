import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return NextResponse.json(
    { ok: true, message: "Lead ingest stub", received: body },
    { status: 201 },
  );
}
