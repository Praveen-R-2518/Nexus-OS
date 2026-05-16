import { NextResponse } from "next/server";
import type { WorkflowLog } from "@/types";

export async function GET() {
  const data: WorkflowLog[] = [];
  return NextResponse.json({ data });
}
