import { NextResponse } from "next/server";
import type { DailyReport } from "@/types";

export async function GET() {
  const data: DailyReport[] = [];
  return NextResponse.json({ data });
}
