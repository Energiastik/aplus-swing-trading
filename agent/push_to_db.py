"""Push a completed scan's results (the same JSON schema documented in
agent/pdf_report.py) directly into Postgres -- for interactive/manual use
from a session with real Postgres connectivity (like the one that built this).

The automated claude.ai routine does NOT use this: its sandbox can reach
normal HTTPS but not raw Postgres wire protocol on a non-standard port, so it
instead annotates its JSON with agent/tv_symbol.py and POSTs it to the web
app's own /api/ingest endpoint, which does the equivalent write server-side
(see web/app/api/ingest/route.ts and strategy/ROUTINE_PROMPT.md). This module
stays useful for manual pushes and backfills from an environment that *can*
reach Postgres directly.

Usage:
    DATABASE_URL=postgresql://... python -m agent.push_to_db output/results_2026-08-08.json
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

from agent.tv_symbol import resolve_tv_symbol

SCHEMA = """
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
"""

def connect(database_url: str | None = None):
    url = database_url or os.environ["DATABASE_URL"]
    conn = psycopg2.connect(url)
    with conn.cursor() as cur:
        cur.execute(SCHEMA)
    conn.commit()
    return conn


def write_run(conn, data: dict) -> int:
    r = data.get("regime", {})
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO runs (date, regime_score, regime_mode, vix, vix_note, "
            "size_multiplier, regime_checks, sector_highlights, footer_note) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (date) DO UPDATE SET "
            "regime_score=EXCLUDED.regime_score, regime_mode=EXCLUDED.regime_mode, "
            "vix=EXCLUDED.vix, vix_note=EXCLUDED.vix_note, "
            "size_multiplier=EXCLUDED.size_multiplier, "
            "regime_checks=EXCLUDED.regime_checks, "
            "sector_highlights=EXCLUDED.sector_highlights, footer_note=EXCLUDED.footer_note "
            "RETURNING id",
            (data.get("date"), r.get("score"), r.get("mode"), r.get("vix"), r.get("vix_note"),
             r.get("size_multiplier"), psycopg2.extras.Json(r.get("checks", {})),
             data.get("sector_rotation_highlights"), data.get("footer_note")),
        )
        run_id = cur.fetchone()[0]

        for t in ("sector_table", "all_candidates", "top10", "verdicts"):
            cur.execute(f"DELETE FROM {t} WHERE run_id = %s", (run_id,))

        for s in data.get("sector_table", []):
            cur.execute(
                "INSERT INTO sector_table (run_id, rank, etf, sector, w1, w4, w12, weighted) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (run_id, s.get("rank"), s.get("etf"), s.get("sector"),
                 s.get("w1"), s.get("w4"), s.get("w12"), s.get("weighted")))

        for c in data.get("all_candidates", []):
            if isinstance(c, dict):
                cur.execute("INSERT INTO all_candidates (run_id, ticker, sector) VALUES (%s, %s, %s)",
                            (run_id, c.get("ticker"), c.get("sector")))
            else:
                cur.execute("INSERT INTO all_candidates (run_id, ticker, sector) VALUES (%s, %s, NULL)",
                            (run_id, c))

        for i, c in enumerate(data.get("top10", []), 1):
            cur.execute(
                "INSERT INTO top10 (run_id, rank, ticker, tv_symbol, composite_score, "
                "chart_grade, sector_stage, rr, earnings_days, explanation) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (run_id, i, c.get("ticker"), resolve_tv_symbol(c.get("ticker")),
                 c.get("composite_score"), c.get("chart_grade"), c.get("sector_stage"),
                 c.get("rr"), c.get("earnings_days"), c.get("explanation")))

        for v in data.get("verdicts", []):
            cur.execute(
                "INSERT INTO verdicts (run_id, ticker, tv_symbol, entry, stop, target, rr, "
                "expected_gain_pct, reasoning) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (run_id, v.get("ticker"), resolve_tv_symbol(v.get("ticker")),
                 v.get("entry"), v.get("stop"), v.get("target"), v.get("rr"),
                 v.get("expected_gain_pct"), v.get("reasoning")))

    conn.commit()
    return run_id


def main():
    if len(sys.argv) < 2:
        print("Usage: DATABASE_URL=... python -m agent.push_to_db <results.json>", file=sys.stderr)
        sys.exit(1)
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    conn = connect()
    run_id = write_run(conn, data)
    print(f"Wrote run_id={run_id} for date={data.get('date')}")


if __name__ == "__main__":
    main()
