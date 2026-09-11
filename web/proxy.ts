import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Everything requires a logged-in session EXCEPT:
//  - the login/register pages and their API routes (obviously -- can't
//    require a session to get a session)
//  - /api/ingest -- this is called by the Python routine, a machine with no
//    browser session, authenticated separately by its own INGEST_SECRET
//    bearer token. Gating it here would break the daily scan.
//  - /api/telegram-webhook -- called by Telegram's servers, no browser
//    session either, authenticated by its own secret-token header instead.
//  - /api/watchlist/recheck -- called by Vercel Cron (see vercel.json), no
//    browser session either, authenticated by its own CRON_SECRET bearer
//    check instead.
//  - Next.js internals and static assets.
const PUBLIC_PATHS = ["/login", "/register", "/api/auth", "/api/ingest", "/api/telegram-webhook", "/api/watchlist/recheck"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Fail OPEN, not closed: if SESSION_SECRET isn't configured yet (e.g. this
  // deploy landed before the env var was set in Vercel), don't lock every
  // visitor out of the whole public dashboard with an unusable login page --
  // just skip the gate and let the site work as it did before login existed.
  // This app has no sensitive data behind it either way (see the disclaimer
  // banner); the login is for usage tracking, not access control, so failing
  // open here is the safer default, not a security regression.
  if (!process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET is not set -- skipping the login gate entirely");
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next.js internals and common static file
    // extensions, so the check doesn't fire per-asset.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
