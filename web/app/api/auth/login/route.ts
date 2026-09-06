import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createSessionToken, logLogin, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "missing_email_or_password" }, { status: 400 });
  }

  let user;
  try {
    user = await verifyCredentials(email, password);
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "login_failed" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken(user);
  } catch (err) {
    console.error("session creation failed", err);
    return NextResponse.json({ error: "login_failed" }, { status: 500 });
  }
  await logLogin(user, req.headers.get("user-agent"));

  const res = NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
