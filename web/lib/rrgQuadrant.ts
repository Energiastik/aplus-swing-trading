/** Reads the RRG quadrant (Improving/Leading/Lagging/Weakening) for a
 * sector or theme name, straight from the rrg_points table the daily
 * routine already populates via /api/ingest -- no recomputation, just a
 * read against the same production DB the dashboard itself reads from. */
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _rrgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._rrgPool) {
    global._rrgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return global._rrgPool;
}

export type Quadrant = "Leading" | "Improving" | "Weakening" | "Lagging";

export interface RrgReading {
  name: string;
  rs_ratio: number;
  rs_momentum: number;
  quadrant: Quadrant;
  week_date: string;
}

function classify(rsRatio: number, rsMomentum: number): Quadrant {
  if (rsRatio >= 100 && rsMomentum >= 100) return "Leading";
  if (rsRatio < 100 && rsMomentum >= 100) return "Improving";
  if (rsRatio >= 100 && rsMomentum < 100) return "Weakening";
  return "Lagging";
}

/** Latest WEEKLY point for a given sector/theme name (weekly, not daily --
 * less noisy for a scoring signal). Returns null if the name has no RRG
 * history yet (e.g. a run before this feature existed, or a genuinely
 * unmatched theme). */
export async function getLatestRrgReading(name: string): Promise<RrgReading | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT name, rs_ratio, rs_momentum, week_date
       FROM rrg_points
       WHERE name = $1 AND period = 'W' AND rs_ratio IS NOT NULL AND rs_momentum IS NOT NULL
       ORDER BY week_date DESC
       LIMIT 1`,
      [name]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      name: row.name,
      rs_ratio: row.rs_ratio,
      rs_momentum: row.rs_momentum,
      quadrant: classify(row.rs_ratio, row.rs_momentum),
      week_date: row.week_date instanceof Date ? row.week_date.toISOString().slice(0, 10) : row.week_date,
    };
  } catch {
    return null; // never let a DB hiccup here block the whole verdict -- purely a bonus signal
  }
}
