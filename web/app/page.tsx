import { getLatestRun } from "@/lib/db";
import { GradeBadge, StageBadge, RegimeModeBadge } from "@/components/Badges";
import TradingViewWidget from "@/components/TradingViewWidget";

export const revalidate = 300; // re-render at most every 5 min; data changes ~daily

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
}

export default async function DashboardPage() {
  let run;
  try {
    run = await getLatestRun();
  } catch (err) {
    return (
      <main className="container">
        <div className="panel">
          <h2>База данных недоступна</h2>
          <p className="meta-line">
            Не удалось подключиться к базе данных. Попробуйте обновить страницу через
            минуту.
          </p>
        </div>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="container">
        <h1>A+ Swing Trading</h1>
        <div className="panel">
          <p className="empty-state">
            Пока нет ни одного сохранённого результата сканирования. Запустите анализ и
            выполните agent/push_to_db.py, чтобы данные появились здесь.
          </p>
        </div>
      </main>
    );
  }

  const checks = Object.entries(run.regime_checks || {});

  return (
    <main className="container">
      <h1>A+ Swing Trading</h1>
      <p className="meta-line">
        Скрининг за {fmtDate(run.date)} · обновлено{" "}
        {new Date(run.created_at).toLocaleString("ru-RU")}
      </p>

      {/* Regime / market health */}
      <section className="panel">
        <h2>
          Режим рынка <RegimeModeBadge mode={run.regime_mode} />
        </h2>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-label">Оценка режима</div>
            <div className="stat-value">{run.regime_score ?? "—"}/4</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">VIX</div>
            <div className="stat-value">{run.vix?.toFixed(1) ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Множитель размера</div>
            <div className="stat-value">×{run.size_multiplier ?? "—"}</div>
          </div>
        </div>
        {run.vix_note && <p className="meta-line" style={{ marginTop: "0.75rem" }}>{run.vix_note}</p>}
        <div className="check-row">
          {checks.map(([label, ok]) => (
            <span key={label} className={ok ? "check-ok" : "check-fail"}>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Sector rotation */}
      <section className="panel">
        <h2>Ротация секторов</h2>
        {run.sector_table.length === 0 ? (
          <p className="empty-state">Нет данных по секторам за этот запуск.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>ETF</th>
                <th>Сектор</th>
                <th>1НЕД</th>
                <th>4НЕД</th>
                <th>12НЕД</th>
                <th>Балл</th>
              </tr>
            </thead>
            <tbody>
              {run.sector_table.map((s) => (
                <tr key={s.etf}>
                  <td>{s.rank}</td>
                  <td>
                    <b>{s.etf}</b>
                  </td>
                  <td>{s.sector}</td>
                  <td>{s.w1}</td>
                  <td>{s.w4}</td>
                  <td>{s.w12}</td>
                  <td>{s.weighted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {run.sector_highlights && (
          <p className="meta-line" style={{ marginTop: "1rem" }}>
            {run.sector_highlights}
          </p>
        )}
      </section>

      {/* All candidates */}
      <section className="panel">
        <h2>Все кандидаты, прошедшие скринер ({run.all_candidates.length})</h2>
        {run.all_candidates.length === 0 ? (
          <p className="empty-state">Список кандидатов пуст.</p>
        ) : (
          <div>
            {run.all_candidates.map((c) => (
              <span className="candidate-chip" key={c.ticker}>
                <b>{c.ticker}</b>
                {c.sector && <span className="sector"> · {c.sector}</span>}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Top 10 */}
      <section className="panel">
        <h2>Топ-10 кандидатов</h2>
        {run.top10.length === 0 ? (
          <p className="empty-state">Недостаточно кандидатов для топ-10.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Тикер</th>
                <th>Балл</th>
                <th>График</th>
                <th>Стадия</th>
                <th>R/R</th>
                <th>До отчёта</th>
                <th>Пояснение</th>
              </tr>
            </thead>
            <tbody>
              {run.top10.map((c) => (
                <tr key={c.ticker}>
                  <td>{c.rank}</td>
                  <td>
                    <b>{c.ticker}</b>
                  </td>
                  <td>{c.composite_score ?? "—"}</td>
                  <td>
                    <GradeBadge grade={c.chart_grade} />
                  </td>
                  <td>
                    <StageBadge stage={c.sector_stage} />
                  </td>
                  <td>{c.rr ?? "—"}</td>
                  <td>{c.earnings_days ?? "—"}</td>
                  <td style={{ maxWidth: 340 }}>{c.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Verdicts */}
      <section className="panel">
        <h2>Топ-3 рекомендации — итоговый вердикт</h2>
        {run.verdicts.length === 0 ? (
          <p className="empty-state">
            Сегодня ни один кандидат не прошёл все фильтры полностью. Не создаём сетап
            из ничего — это день наблюдения.
          </p>
        ) : (
          run.verdicts.map((v) => (
            <div className="verdict-card" key={v.ticker}>
              <div className="verdict-header">
                <span className="verdict-ticker">{v.ticker}</span>
                <div className="verdict-metrics">
                  <span>
                    Вход <b>{v.entry}</b>
                  </span>
                  <span>
                    Стоп <b>{v.stop}</b>
                  </span>
                  <span>
                    Цель <b>{v.target}</b>
                  </span>
                  <span>
                    R/R <b>{v.rr}</b>
                  </span>
                  <span>
                    Рост <b>{v.expected_gain_pct}</b>
                  </span>
                </div>
              </div>
              <TradingViewWidget symbol={v.tv_symbol} />
              {v.reasoning && <p className="verdict-reasoning">{v.reasoning}</p>}
            </div>
          ))
        )}
      </section>

      {run.footer_note && <p className="footer-note">{run.footer_note}</p>}
    </main>
  );
}
