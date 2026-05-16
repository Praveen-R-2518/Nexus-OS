import { NextResponse } from "next/server";
import type { Conversation } from "@/types";

export async function GET() {
  const data: Conversation[] = [];
  return NextResponse.json({ data });
}
