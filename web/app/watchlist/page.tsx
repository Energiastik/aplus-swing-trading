import { cookies } from "next/headers";
import { getWatchlist, type WatchlistRow } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import WatchlistView from "@/components/WatchlistView";

// Watchlist rows change per /add, not once a day like `runs` -- no point
// caching this the way the main dashboard's 5-minute revalidate does.
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

  let rows: WatchlistRow[];
  let dbError = false;
  try {
    rows = await getWatchlist();
  } catch (err) {
    console.error("getWatchlist failed", err);
    dbError = true;
    rows = [];
  }

  const sessionLabel = session?.name || session?.email || null;

  return <WatchlistView initialRows={rows} dbError={dbError} sessionLabel={sessionLabel} />;
}
