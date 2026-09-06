import { cookies } from "next/headers";
import { getLatestRun } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export const revalidate = 300; // re-render at most every 5 min; data changes ~daily

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

  let run;
  let dbError = false;
  try {
    run = await getLatestRun();
  } catch (err) {
    console.error("getLatestRun failed", err);
    dbError = true;
    run = null;
  }

  const sessionLabel = session?.name || session?.email || null;

  return <Dashboard run={run} dbError={dbError} sessionLabel={sessionLabel} />;
}
