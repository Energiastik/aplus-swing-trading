import { NextResponse } from "next/server";
import { getLatestRun } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const run = await getLatestRun();
    if (!run) {
      return NextResponse.json({ error: "no_runs_yet" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    console.error("dashboard fetch failed", err);
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }
}
