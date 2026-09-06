import { NextRequest, NextResponse } from "next/server";
import { createUser, createSessionToken, logLogin, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { email, password, name } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "missing_email_or_password" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  let user;
  try {
    user = await createUser(email, password, name);
  } catch (err: unknown) {
    const dbErr = err as { code?: string };
    if (dbErr?.code === "23505") {
      // unique_violation on email
      return NextResponse.json({ error: "email_already_registered" }, { status: 409 });
    }
    console.error("register failed", err);
    return NextResponse.json({ error: "register_failed" }, { status: 500 });
  }

  let token: string;
  try {
    token = await createSessionToken(user);
  } catch (err) {
    console.error("session creation failed", err);
    return NextResponse.json({ error: "register_failed" }, { status: 500 });
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
