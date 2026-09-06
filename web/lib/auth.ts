import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// Separate pool from lib/db.ts's -- same DB, but auth queries are a distinct
// concern from the scan-results read path, and this file needs to work
// standalone (Node.js API routes only; middleware never imports this --
// see the jose-only session helpers below, which ARE edge-safe).
declare global {
  // eslint-disable-next-line no-var
  var _authPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._authPool) {
    global._authPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return global._authPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    logged_in_at TIMESTAMPTZ DEFAULT now(),
    user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_log_user ON login_log(user_id);
`;

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(SCHEMA);
  schemaReady = true;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
}

export async function createUser(email: string, password: string, name?: string): Promise<AuthUser> {
  await ensureSchema();
  const hash = await bcrypt.hash(password, 10);
  const res = await getPool().query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name`,
    [email.toLowerCase().trim(), hash, name?.trim() || null]
  );
  return res.rows[0];
}

export async function verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function logLogin(user: AuthUser, userAgent: string | null): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO login_log (user_id, email, user_agent) VALUES ($1, $2, $3)`,
    [user.id, user.email, userAgent]
  );
}

// ---------- Session (JWT) -- uses `jose`, which runs in the Edge runtime,
// so middleware.ts can verify a session without opening a Postgres
// connection (Edge functions can't hold a raw TCP socket the way `pg`
// needs). Login/register themselves stay Node.js API routes -- that's
// where bcrypt and the DB pool above actually run. ----------

const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set -- required to sign/verify login sessions");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  return await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export interface SessionPayload {
  userId: number;
  email: string;
  name: string | null;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      userId: Number(payload.sub),
      email: String(payload.email),
      name: (payload.name as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
