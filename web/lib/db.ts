import { Pool } from "pg";

// Reuse one pool across invocations in the same serverless instance (Vercel
// keeps warm instances between requests) instead of opening a new connection
// per request -- important against Supabase's pooler, which has a real
// concurrent-connection ceiling on the free tier.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return global._pgPool;
}

export interface RegimeChecks {
  [label: string]: boolean;
}

export interface SectorRow {
  rank: number;
  etf: string;
  sector: string;
  w1: string;
  w4: string;
  w12: string;
  weighted: number;
}

export interface CandidateRow {
  ticker: string;
  sector: string | null;
}

export interface NewsItem {
  title?: string;
  url?: string;
  published_at?: string;
  summary?: string;
}

export interface Top10Row {
  rank: number;
  ticker: string;
  tv_symbol: string;
  composite_score: number | null;
  chart_grade: string | null;
  sector_stage: string | null;
  rr: string | null;
  earnings_days: string | null;
  explanation: string | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  revenue_usd: number | null;
  revenue_growth: number | null;
  eps: number | null;
  eps_growth: number | null;
  debt_to_equity: number | null;
  business_summary: string | null;
  news: NewsItem[] | null;
}

export interface ThemeRow {
  name: string;
  kind: string | null;
  etf: string;
  tv_symbol: string;
  srs: number | null;
  d3d: number | null;
  breadth_pct: number | null;
  breadth_trend: string | null;
  ema_stack: string | null;
  ema_slope: string | null;
  rel_vol: number | null;
  vol_trend: string | null;
  streak_leaders: number | null;
  avg_streak: number | null;
  breakouts_20d: number | null;
  higher_lows: number | null;
  universe: number | null;
  accum_ratio: number | null;
  status: string | null;
}

export interface VerdictRow {
  ticker: string;
  tv_symbol: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rr: string | null;
  expected_gain_pct: string | null;
  reasoning: string | null;
}

export interface RunData {
  id: number;
  date: string;
  regime_score: number | null;
  regime_mode: string | null;
  vix: number | null;
  vix_note: string | null;
  size_multiplier: number | null;
  regime_checks: RegimeChecks;
  sector_highlights: string | null;
  footer_note: string | null;
  created_at: string;
  sector_table: SectorRow[];
  all_candidates: CandidateRow[];
  top10: Top10Row[];
  verdicts: VerdictRow[];
  theme_rotation: ThemeRow[];
}

export async function getLatestRun(): Promise<RunData | null> {
  const pool = getPool();
  const runRes = await pool.query(
    `SELECT id, date, regime_score, regime_mode, vix, vix_note, size_multiplier,
            regime_checks, sector_highlights, footer_note, created_at
     FROM runs ORDER BY date DESC LIMIT 1`
  );
  if (runRes.rows.length === 0) return null;
  const run = runRes.rows[0];

  const [sectorRes, candidatesRes, top10Res, verdictsRes, themeRes] = await Promise.all([
    pool.query(
      `SELECT rank, etf, sector, w1, w4, w12, weighted FROM sector_table
       WHERE run_id = $1 ORDER BY rank`,
      [run.id]
    ),
    pool.query(
      `SELECT ticker, sector FROM all_candidates WHERE run_id = $1 ORDER BY ticker`,
      [run.id]
    ),
    pool.query(
      `SELECT rank, ticker, tv_symbol, composite_score, chart_grade, sector_stage,
              rr, earnings_days, explanation, pe_ratio, forward_pe, revenue_usd,
              revenue_growth, eps, eps_growth, debt_to_equity, business_summary, news
       FROM top10
       WHERE run_id = $1 ORDER BY rank`,
      [run.id]
    ),
    pool.query(
      `SELECT ticker, tv_symbol, entry, stop, target, rr, expected_gain_pct, reasoning
       FROM verdicts WHERE run_id = $1`,
      [run.id]
    ),
    pool.query(
      `SELECT name, kind, etf, tv_symbol, srs, d3d, breadth_pct, breadth_trend,
              ema_stack, ema_slope, rel_vol, vol_trend, streak_leaders, avg_streak,
              breakouts_20d, higher_lows, universe, accum_ratio, status
       FROM theme_rotation WHERE run_id = $1 ORDER BY srs DESC NULLS LAST`,
      [run.id]
    ),
  ]);

  return {
    ...run,
    date: run.date instanceof Date ? run.date.toISOString().slice(0, 10) : run.date,
    sector_table: sectorRes.rows,
    all_candidates: candidatesRes.rows,
    top10: top10Res.rows,
    verdicts: verdictsRes.rows,
    theme_rotation: themeRes.rows,
  };
}

export async function getRunHistory(limit = 30): Promise<
  { date: string; regime_score: number | null; regime_mode: string | null }[]
> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT date, regime_score, regime_mode FROM runs ORDER BY date DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({
    ...r,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
  }));
}
