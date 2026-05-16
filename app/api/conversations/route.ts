import { supabaseAdmin } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const isDev = process.env.NODE_ENV === "development";

  try {
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/conversations] Supabase error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch conversations",
          ...(isDev && { details: error.message }),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: data ?? [],
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/conversations] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch conversations",
        ...(isDev && { details: msg }),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === "development";

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body",
          ...(isDev && { details: "Request body must be JSON" }),
        },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          ...(isDev && { details: "Body must be a JSON object" }),
        },
        { status: 400 },
      );
    }

    const message = body.message;
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "message is required",
          ...(isDev && {
            details: "Provide non-empty string field `message`",
          }),
        },
        { status: 400 },
      );
    }

    const rawPayload = Object.prototype.hasOwnProperty.call(
      body,
      "raw_payload",
    )
      ? body.raw_payload
      : body;

    const source =
      typeof body.source === "string" ? body.source : "n8n";
    const customerName =
      typeof body.customer_name === "string" ? body.customer_name : null;
    const customerEmail =
      typeof body.customer_email === "string" ? body.customer_email : null;
    const customerPhone =
      typeof body.customer_phone === "string" ? body.customer_phone : null;
    const channel =
      typeof body.channel === "string" ? body.channel : "email";
    const status =
      typeof body.status === "string" ? body.status : "unread";

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        source,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        channel,
        message: message.trim(),
        raw_payload: rawPayload,
        status,
        received_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/conversations] Supabase error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to create conversation",
          ...(isDev && { details: error.message }),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/conversations] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create conversation",
        ...(isDev && { details: msg }),
      },
      { status: 500 },
    );
  }
}
