import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var _ingestPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._ingestPool) {
    global._ingestPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return global._ingestPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    regime_score INT,
    regime_mode TEXT,
    vix REAL,
    vix_note TEXT,
    size_multiplier REAL,
    regime_checks JSONB,
    sector_highlights TEXT,
    footer_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sector_table (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
    rank INT, etf TEXT, sector TEXT, w1 TEXT, w4 TEXT, w12 TEXT, weighted INT
);
CREATE TABLE IF NOT EXISTS all_candidates (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
    ticker TEXT, sector TEXT
);
CREATE TABLE IF NOT EXISTS top10 (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
    rank INT, ticker TEXT, tv_symbol TEXT, composite_score REAL, chart_grade TEXT,
    sector_stage TEXT, rr TEXT, earnings_days TEXT, explanation TEXT
);
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS pe_ratio REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS forward_pe REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS revenue_usd REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS revenue_growth REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS eps REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS eps_growth REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS debt_to_equity REAL;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS business_summary TEXT;
ALTER TABLE top10 ADD COLUMN IF NOT EXISTS news JSONB;
CREATE TABLE IF NOT EXISTS theme_rotation (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
    name TEXT, kind TEXT, etf TEXT, tv_symbol TEXT,
    srs REAL, d3d REAL, breadth_pct REAL, breadth_trend TEXT,
    ema_stack TEXT, ema_slope TEXT, rel_vol REAL, vol_trend TEXT,
    streak_leaders INT, avg_streak REAL, breakouts_20d INT, higher_lows INT,
    universe INT, accum_ratio REAL, status TEXT
);
CREATE INDEX IF NOT EXISTS idx_theme_rotation_run ON theme_rotation(run_id);
CREATE TABLE IF NOT EXISTS verdicts (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
    ticker TEXT, tv_symbol TEXT, entry REAL, stop REAL, target REAL, rr TEXT,
    expected_gain_pct TEXT, reasoning TEXT
);
CREATE INDEX IF NOT EXISTS idx_sector_table_run ON sector_table(run_id);
CREATE INDEX IF NOT EXISTS idx_all_candidates_run ON all_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_top10_run ON top10(run_id);
CREATE INDEX IF NOT EXISTS idx_verdicts_run ON verdicts(run_id);
`;

let schemaReady = false;

interface IngestBody {
  date?: string;
  regime?: {
    score?: number;
    mode?: string;
    vix?: number;
    vix_note?: string;
    size_multiplier?: number;
    checks?: Record<string, boolean>;
  };
  sector_rotation_highlights?: string;
  footer_note?: string;
  sector_table?: Array<{
    rank?: number;
    etf?: string;
    sector?: string;
    w1?: string;
    w4?: string;
    w12?: string;
    weighted?: number;
  }>;
  all_candidates?: Array<{ ticker?: string; sector?: string } | string>;
  theme_rotation?: Array<{
    name?: string;
    kind?: string;
    etf?: string;
    tv_symbol?: string;
    srs?: number;
    d3d?: number;
    breadth_pct?: number;
    breadth_trend?: string;
    ema_stack?: string;
    ema_slope?: string;
    rel_vol?: number;
    vol_trend?: string;
    streak_leaders?: number;
    avg_streak?: number;
    breakouts_20d?: number;
    higher_lows?: number;
    universe?: number;
    accum_ratio?: number;
    status?: string;
  }>;
  top10?: Array<{
    ticker?: string;
    tv_symbol?: string;
    composite_score?: number;
    chart_grade?: string;
    sector_stage?: string;
    rr?: string;
    earnings_days?: string;
    explanation?: string;
    pe_ratio?: number;
    forward_pe?: number;
    revenue_usd?: number;
    revenue_growth?: number;
    eps?: number;
    eps_growth?: number;
    debt_to_equity?: number;
    business_summary?: string;
    news?: Array<{ title?: string; url?: string; published_at?: string; summary?: string }>;
  }>;
  verdicts?: Array<{
    ticker?: string;
    tv_symbol?: string;
    entry?: number;
    stop?: number;
    target?: number;
    rr?: string;
    expected_gain_pct?: string;
    reasoning?: string;
  }>;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INGEST_SECRET}`;
  if (!process.env.INGEST_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.date || typeof body.date !== "string") {
    return NextResponse.json({ error: "missing_required_field: date" }, { status: 400 });
  }
  if (!body.regime || typeof body.regime !== "object") {
    return NextResponse.json({ error: "missing_required_field: regime" }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    if (!schemaReady) {
      await client.query(SCHEMA);
      schemaReady = true;
    }

    await client.query("BEGIN");

    const r = body.regime;
    const runRes = await client.query(
      `INSERT INTO runs (date, regime_score, regime_mode, vix, vix_note, size_multiplier,
                          regime_checks, sector_highlights, footer_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (date) DO UPDATE SET
         regime_score = EXCLUDED.regime_score, regime_mode = EXCLUDED.regime_mode,
         vix = EXCLUDED.vix, vix_note = EXCLUDED.vix_note,
         size_multiplier = EXCLUDED.size_multiplier, regime_checks = EXCLUDED.regime_checks,
         sector_highlights = EXCLUDED.sector_highlights, footer_note = EXCLUDED.footer_note
       RETURNING id`,
      [
        body.date,
        r.score ?? null,
        r.mode ?? null,
        r.vix ?? null,
        r.vix_note ?? null,
        r.size_multiplier ?? null,
        JSON.stringify(r.checks ?? {}),
        body.sector_rotation_highlights ?? null,
        body.footer_note ?? null,
      ]
    );
    const runId = runRes.rows[0].id;

    for (const t of ["sector_table", "all_candidates", "top10", "verdicts", "theme_rotation"]) {
      await client.query(`DELETE FROM ${t} WHERE run_id = $1`, [runId]);
    }

    for (const s of body.sector_table ?? []) {
      await client.query(
        `INSERT INTO sector_table (run_id, rank, etf, sector, w1, w4, w12, weighted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [runId, s.rank ?? null, s.etf ?? null, s.sector ?? null, s.w1 ?? null, s.w4 ?? null, s.w12 ?? null, s.weighted ?? null]
      );
    }

    for (const c of body.all_candidates ?? []) {
      if (typeof c === "string") {
        await client.query(
          `INSERT INTO all_candidates (run_id, ticker, sector) VALUES ($1, $2, NULL)`,
          [runId, c]
        );
      } else {
        await client.query(
          `INSERT INTO all_candidates (run_id, ticker, sector) VALUES ($1, $2, $3)`,
          [runId, c.ticker ?? null, c.sector ?? null]
        );
      }
    }

    let rank = 1;
    for (const c of body.top10 ?? []) {
      await client.query(
        `INSERT INTO top10 (run_id, rank, ticker, tv_symbol, composite_score, chart_grade,
                             sector_stage, rr, earnings_days, explanation, pe_ratio, forward_pe,
                             revenue_usd, revenue_growth, eps, eps_growth, debt_to_equity,
                             business_summary, news)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          runId, rank++, c.ticker ?? null, c.tv_symbol ?? c.ticker ?? null,
          c.composite_score ?? null, c.chart_grade ?? null, c.sector_stage ?? null,
          c.rr ?? null, c.earnings_days ?? null, c.explanation ?? null,
          c.pe_ratio ?? null, c.forward_pe ?? null, c.revenue_usd ?? null,
          c.revenue_growth ?? null, c.eps ?? null, c.eps_growth ?? null,
          c.debt_to_equity ?? null, c.business_summary ?? null,
          c.news ? JSON.stringify(c.news) : null,
        ]
      );
    }

    for (const t of body.theme_rotation ?? []) {
      await client.query(
        `INSERT INTO theme_rotation (run_id, name, kind, etf, tv_symbol, srs, d3d,
                                      breadth_pct, breadth_trend, ema_stack, ema_slope,
                                      rel_vol, vol_trend, streak_leaders, avg_streak,
                                      breakouts_20d, higher_lows, universe, accum_ratio, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          runId, t.name ?? null, t.kind ?? null, t.etf ?? null, t.tv_symbol ?? t.etf ?? null,
          t.srs ?? null, t.d3d ?? null, t.breadth_pct ?? null, t.breadth_trend ?? null,
          t.ema_stack ?? null, t.ema_slope ?? null, t.rel_vol ?? null, t.vol_trend ?? null,
          t.streak_leaders ?? null, t.avg_streak ?? null, t.breakouts_20d ?? null,
          t.higher_lows ?? null, t.universe ?? null, t.accum_ratio ?? null, t.status ?? null,
        ]
      );
    }

    for (const v of body.verdicts ?? []) {
      await client.query(
        `INSERT INTO verdicts (run_id, ticker, tv_symbol, entry, stop, target, rr,
                                expected_gain_pct, reasoning)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          runId, v.ticker ?? null, v.tv_symbol ?? v.ticker ?? null, v.entry ?? null,
          v.stop ?? null, v.target ?? null, v.rr ?? null, v.expected_gain_pct ?? null,
          v.reasoning ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, run_id: runId, date: body.date });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ingest failed", err);
    return NextResponse.json({ error: "ingest_failed", detail: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
