"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ru" | "en";

// Every static UI string in the app. Dynamic, routine-generated content
// (explanations, reasoning, geopolitical summaries, news, business
// summaries) is NOT here -- it comes from the DB with its own _en
// companion field per row (see lib/db.ts), because it's freshly written
// prose each day, not a fixed label. Components pick between the two with
// pickText()/pickBilingual() below.
const DICT = {
  ru: {
    db_unavailable_title: "База данных недоступна",
    db_unavailable_body: "Не удалось подключиться к базе данных. Попробуйте обновить страницу через минуту.",
    no_runs_yet: "Пока нет ни одного сохранённого результата сканирования. Запустите анализ и выполните agent/push_to_db.py, чтобы данные появились здесь.",
    scan_for: "Скрининг за",
    updated: "обновлено",
    logout: "Выйти",

    disclaimer: "⚠ Это не финансовая консультация. Вся информация на этой странице — результат автоматического скрининга и носит образовательный характер. Скринер — это фильтр, а не сигнал к действию; ни один тикер не является рекомендацией купить или продать. Проведите собственное исследование (DYOR), проверьте халяльность самостоятельно и проконсультируйтесь с независимым финансовым консультантом перед принятием решений. Торговля акциями связана с риском потери капитала.",

    macro_geo_title: "Макро и геополитика",
    inflation_cpi: "Инфляция (CPI, г/г)",
    fed_funds_rate: "Ставка ФРС",
    nfp: "Нонфарм (NFP)",
    jobless_claims: "Заявки на пособие",
    gdp_growth: "Рост ВВП (год. темп)",
    previous_short: "пред.",
    macro_unavailable: "Макро-данные недоступны",
    source_fred: "Источник: FRED (официальные данные ФРС).",
    source_web_search: "Источник: веб-поиск (не официальный API — сверьте перед принятием решений).",

    stage1_title: "Здоровье рынка",
    stage1_subtitle: "Общий режим и готовность рисковать",
    market_regime: "Режим рынка",
    regime_score: "Оценка режима",
    size_multiplier: "Множитель размера",

    stage2_title: "Основные индексы",
    stage2_subtitle: "Куда идёт широкий рынок",
    market_overview: "Быстрый обзор рынка",
    market_overview_note: "2ч, 6 месяцев, EMA + объём. (Примечание: 4-часовой интервал недоступен в бесплатном виджете TradingView — он ограничен 2ч максимум для внутридневных графиков; это подтверждённое ограничение виджета, не настройка страницы.)",

    stage3_title: "Секторы: идентификация и ротация",
    stage3_subtitle: "Какие сектора набирают силу, какие теряют",
    sector_rotation: "Ротация секторов",
    no_sector_data: "Нет данных по секторам за этот запуск.",
    th_rank: "#",
    th_etf: "ETF",
    th_sector: "Сектор",
    th_w1: "1НЕД",
    th_w4: "4НЕД",
    th_w12: "12НЕД",
    th_score: "Балл",

    sector_vs_spy: "Секторы против SPY",
    sector_vs_spy_note: "Все 11 секторов наложены на один график в процентах от SPY. Кликните по тикеру в легенде справа, чтобы скрыть/показать его. Кнопки под графиком (5Д, 1М, 3М и т.д.) переключают период сравнения.",

    themes_title: "Темы и под-темы",
    themes_note: "Building/Emerging — набирают силу или разворачиваются после падения (то, что стоит отслеживать). Leading — уже лидируют. Fading/Lagging — теряют силу или отстают. Кликните карточку, чтобы открыть график за 3 месяца и визуально проверить разворот, сопротивление или консолидацию у основания.",
    no_theme_data: "Данные по темам за этот запуск недоступны — sector-rotation/pipeline.py не вернул результат, или его вывод ещё не прокинут в этот запуск.",
    kind_theme: "тема",
    kind_sector: "сектор",
    show_chart_3m: "Показать график за 3 месяца ▾",
    srs_label: "SRS",
    delta3d_label: "Δ3Д",
    breadth_label: "Ширина",

    rrg_title: "Relative Rotation Graph (JdK RS-Ratio / RS-Momentum)",
    rrg_axes_note: "Ось X — JdK RS-Ratio (сила против SPY), ось Y — JdK RS-Momentum (ускорение). Наведите на хвост или метку ниже, чтобы увидеть полное название и тип (сектор/под-сектор) и выделить его; кликните метку, чтобы скрыть/показать.",
    rrg_unavailable: "Данные RRG (относительная ротация) за этот запуск недоступны.",
    rrg_period_weekly: "Неделя",
    rrg_period_daily: "День",
    rrg_week_label: "Неделя:",
    rrg_day_label: "День:",
    rrg_to_current_week: "К последней точке →",
    rrg_show_all: "Показать все",
    rrg_hide_all: "Скрыть все",
    rrg_default_filter_note: "По умолчанию показаны только сектора/под-сектора в квадрантах «Улучшение» и «Лидеры» (ускоряющиеся) — остальное скрыто, чтобы не создавать визуальный шум. Кликните метку ниже или «Показать все», чтобы вернуть скрытые.",
    rrg_reset_default: "Сбросить к умолчанию",
    rrg_quadrant_improving: "УЛУЧШЕНИЕ",
    rrg_quadrant_leading: "ЛИДЕРЫ",
    rrg_quadrant_lagging: "ОТСТАЮТ",
    rrg_quadrant_weakening: "ОСЛАБЛЕНИЕ",

    stage4_title: "Отбор акций",
    stage4_subtitle: "От широкого списка к конкретным сделкам",
    all_candidates: "Все кандидаты, прошедшие скринер",
    no_candidates: "Список кандидатов пуст.",
    top10_title: "Топ-10 кандидатов",
    not_enough_for_top10: "Недостаточно кандидатов для топ-10.",
    verdicts_title: "Топ-3 рекомендации — итоговый вердикт",
    no_verdicts: "Сегодня ни один кандидат не прошёл все фильтры полностью. Не создаём сетап из ничего — это день наблюдения.",
    entry: "Вход",
    stop: "Стоп",
    target: "Цель",
    gain: "Рост",

    th_ticker: "Тикер",
    th_grade: "Оценка",
    th_stage: "Стадия",
    th_rr: "R/R",
    th_earnings: "До отчёта",
    th_explanation: "Пояснение",
    th_chart: "График",
    show_chart_for: "Показать график",

    close: "Закрыть",
    tab_chart: "График",
    tab_fundamentals: "Фундаментал",
    tab_news: "Новости",
    pe_ratio: "P/E",
    forward_pe: "Forward P/E",
    eps: "EPS",
    eps_growth: "Рост EPS",
    revenue: "Выручка",
    revenue_growth: "Рост выручки",
    debt_to_equity: "Долг / Капитал",
    no_business_summary: "Описание компании недоступно за этот запуск.",
    no_news: "Новости недоступны за этот запуск.",

    stage_building: "Building — формируется",
    stage_emerging: "Emerging — набирает силу",
    stage_leading: "Leading — лидирует",
    stage_fading: "Fading — затухает",
    stage_lagging: "Lagging — отстаёт",
    stage_neutral: "Neutral",
    regime_aggressive: "АГРЕССИВНЫЙ",
    regime_cautious: "ОСТОРОЖНО",
    regime_no_trade: "БЕЗ СДЕЛОК",

    login_title: "A+ Swing Trading",
    login_subtitle: "Войдите, чтобы открыть дашборд",
    email: "Email",
    password: "Пароль",
    logging_in: "Входим…",
    login_button: "Войти",
    no_account: "Нет аккаунта?",
    register_link: "Зарегистрироваться",
    register_subtitle: "Создайте аккаунт для доступа к дашборду",
    name_optional: "Имя (необязательно)",
    password_min: "Пароль (минимум 8 символов)",
    creating: "Создаём…",
    register_button: "Зарегистрироваться",
    have_account: "Уже есть аккаунт?",
    login_link: "Войти",

    err_missing_email_or_password: "Введите email и пароль.",
    err_invalid_credentials: "Неверный email или пароль.",
    err_login_failed: "Ошибка сервера. Попробуйте ещё раз.",
    err_invalid_email: "Некорректный email.",
    err_password_too_short: "Пароль должен быть не короче 8 символов.",
    err_email_already_registered: "Этот email уже зарегистрирован — войдите вместо регистрации.",
    err_register_failed: "Ошибка сервера. Попробуйте ещё раз.",
    err_generic_login: "Не удалось войти.",
    err_generic_register: "Не удалось зарегистрироваться.",
    err_network: "Не удалось связаться с сервером.",
  },
  en: {
    db_unavailable_title: "Database unavailable",
    db_unavailable_body: "Couldn't connect to the database. Try reloading the page in a minute.",
    no_runs_yet: "No scan results saved yet. Run the pipeline and agent/push_to_db.py for data to show up here.",
    scan_for: "Scan for",
    updated: "updated",
    logout: "Log out",

    disclaimer: "⚠ This is not financial advice. Everything on this page is the output of an automated screener and is for educational purposes only. The screener is a filter, not a signal to act on; no ticker here is a recommendation to buy or sell. Do your own research (DYOR), verify halal compliance yourself, and consult an independent financial advisor before making decisions. Trading stocks carries risk of capital loss.",

    macro_geo_title: "Macro & Geopolitics",
    inflation_cpi: "Inflation (CPI, YoY)",
    fed_funds_rate: "Fed Funds Rate",
    nfp: "Nonfarm Payrolls (NFP)",
    jobless_claims: "Jobless Claims",
    gdp_growth: "GDP Growth (annualized)",
    previous_short: "prev.",
    macro_unavailable: "Macro data unavailable",
    source_fred: "Source: FRED (official Fed data).",
    source_web_search: "Source: web search (not an official API — verify before acting on it).",

    stage1_title: "Market Health",
    stage1_subtitle: "Overall regime and risk appetite",
    market_regime: "Market Regime",
    regime_score: "Regime score",
    size_multiplier: "Size multiplier",

    stage2_title: "Main Indices",
    stage2_subtitle: "Where the broad market is heading",
    market_overview: "Quick Market Overview",
    market_overview_note: "2h, 6 months, EMA + volume. (Note: a 4-hour interval isn't available in TradingView's free widget — it caps at 2h for intraday charts; this is a confirmed widget limitation, not a page setting.)",

    stage3_title: "Sectors: Identification & Rotation",
    stage3_subtitle: "Which sectors are gaining strength, which are losing it",
    sector_rotation: "Sector Rotation",
    no_sector_data: "No sector data for this run.",
    th_rank: "#",
    th_etf: "ETF",
    th_sector: "Sector",
    th_w1: "1WK",
    th_w4: "4WK",
    th_w12: "12WK",
    th_score: "Score",

    sector_vs_spy: "Sectors vs. SPY",
    sector_vs_spy_note: "All 11 sectors overlaid on one chart, in % relative to SPY. Click a ticker in the legend on the right to hide/show it. The buttons under the chart (5D, 1M, 3M, etc.) switch the comparison period.",

    themes_title: "Themes & Sub-themes",
    themes_note: "Building/Emerging — gaining strength or turning up after a decline (what's worth watching). Leading — already leading. Fading/Lagging — losing strength or falling behind. Click a card to open its 3-month chart and visually check for a reversal, resistance, or a base forming.",
    no_theme_data: "Theme data isn't available for this run — sector-rotation/pipeline.py didn't return a result, or its output hasn't been fed into this run yet.",
    kind_theme: "theme",
    kind_sector: "sector",
    show_chart_3m: "Show 3-month chart ▾",
    srs_label: "SRS",
    delta3d_label: "Δ3D",
    breadth_label: "Breadth",

    rrg_title: "Relative Rotation Graph (JdK RS-Ratio / RS-Momentum)",
    rrg_axes_note: "X axis — JdK RS-Ratio (strength vs. SPY), Y axis — JdK RS-Momentum (acceleration). Hover a tail or a label below to see its full name and type (sector/sub-sector) and highlight it; click a label to hide/show it.",
    rrg_unavailable: "RRG (relative rotation) data isn't available for this run.",
    rrg_period_weekly: "Weekly",
    rrg_period_daily: "Daily",
    rrg_week_label: "Week:",
    rrg_day_label: "Day:",
    rrg_to_current_week: "Jump to latest →",
    rrg_show_all: "Show all",
    rrg_hide_all: "Hide all",
    rrg_default_filter_note: "Only sectors/sub-sectors in the Improving / Leading quadrants (still accelerating) are shown by default — the rest are hidden to cut visual noise. Click a label below, or \"Show all\", to bring hidden ones back.",
    rrg_reset_default: "Reset to default",
    rrg_quadrant_improving: "IMPROVING",
    rrg_quadrant_leading: "LEADING",
    rrg_quadrant_lagging: "LAGGING",
    rrg_quadrant_weakening: "WEAKENING",

    stage4_title: "Stock Selection",
    stage4_subtitle: "From a broad list to specific trades",
    all_candidates: "All candidates that cleared the screener",
    no_candidates: "The candidate list is empty.",
    top10_title: "Top 10 Candidates",
    not_enough_for_top10: "Not enough candidates for a top 10 yet.",
    verdicts_title: "Top 3 Recommendations — Final Verdict",
    no_verdicts: "No candidate cleared every filter today. We don't force a setup out of nothing — it's a watch-only day.",
    entry: "Entry",
    stop: "Stop",
    target: "Target",
    gain: "Gain",

    th_ticker: "Ticker",
    th_grade: "Grade",
    th_stage: "Stage",
    th_rr: "R/R",
    th_earnings: "To earnings",
    th_explanation: "Explanation",
    th_chart: "Chart",
    show_chart_for: "Show chart for",

    close: "Close",
    tab_chart: "Chart",
    tab_fundamentals: "Fundamentals",
    tab_news: "News",
    pe_ratio: "P/E",
    forward_pe: "Forward P/E",
    eps: "EPS",
    eps_growth: "EPS growth",
    revenue: "Revenue",
    revenue_growth: "Revenue growth",
    debt_to_equity: "Debt / Equity",
    no_business_summary: "No company description available for this run.",
    no_news: "No news available for this run.",

    stage_building: "Building — forming",
    stage_emerging: "Emerging — gaining strength",
    stage_leading: "Leading",
    stage_fading: "Fading",
    stage_lagging: "Lagging",
    stage_neutral: "Neutral",
    regime_aggressive: "AGGRESSIVE",
    regime_cautious: "CAUTIOUS",
    regime_no_trade: "NO TRADES",

    login_title: "A+ Swing Trading",
    login_subtitle: "Log in to open the dashboard",
    email: "Email",
    password: "Password",
    logging_in: "Logging in…",
    login_button: "Log in",
    no_account: "No account?",
    register_link: "Register",
    register_subtitle: "Create an account to access the dashboard",
    name_optional: "Name (optional)",
    password_min: "Password (8 characters minimum)",
    creating: "Creating…",
    register_button: "Register",
    have_account: "Already have an account?",
    login_link: "Log in",

    err_missing_email_or_password: "Enter your email and password.",
    err_invalid_credentials: "Incorrect email or password.",
    err_login_failed: "Server error. Please try again.",
    err_invalid_email: "Invalid email.",
    err_password_too_short: "Password must be at least 8 characters.",
    err_email_already_registered: "This email is already registered — log in instead of registering.",
    err_register_failed: "Server error. Please try again.",
    err_generic_login: "Couldn't log in.",
    err_generic_register: "Couldn't register.",
    err_network: "Couldn't reach the server.",
  },
} as const;

export type DictKey = keyof typeof DICT.ru;

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ru");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "ru") setLangState(saved);
    } catch {
      // localStorage unavailable (private mode etc.) -- just stay on the default.
    }
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {
      // ignore -- worst case the choice doesn't persist across visits
    }
  }

  function t(key: DictKey): string {
    return DICT[lang][key] ?? DICT.ru[key] ?? key;
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage() must be used within a <LanguageProvider>");
  return ctx;
}

/** Pick the English variant of a dynamic (routine-generated) field when EN
 * is selected and it exists, falling back to the Russian original otherwise
 * -- older rows or a partial translation never render blank. */
export function pickText(lang: Lang, ru: string | null | undefined, en: string | null | undefined): string | null {
  if (lang === "en" && en) return en;
  return ru ?? null;
}
