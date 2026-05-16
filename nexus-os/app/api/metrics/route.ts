import { NextResponse } from "next/server";
import type { Metrics } from "@/types";

export async function GET() {
  const data: Metrics = {
    revenue_at_risk: 0,
    hot_leads: 0,
    churn_risks: 0,
    hours_saved: 0,
  };
  return NextResponse.json({ data });
}
