import { NextResponse } from "next/server";

type ApprovalBody = {
  draftId?: string;
  action?: "approve" | "reject";
  reason?: string;
};

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as ApprovalBody | null;

  if (!body?.draftId || typeof body.draftId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid draftId" },
      { status: 400 },
    );
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  if (body.action === "reject" && (!body.reason || body.reason.trim() === "")) {
    return NextResponse.json(
      { error: "reason is required when rejecting" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    draftId: body.draftId,
    action: body.action,
    reason: body.action === "reject" ? body.reason : undefined,
  });
}
