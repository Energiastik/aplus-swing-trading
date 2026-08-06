"""Configuration for the sector rotation tracker."""
from pathlib import Path

ROOT_DIR = Path(__file__).parent
DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

BENCHMARK = "SPY"

# SPDR sector ETFs, keyed by the GICS sector name used on the Wikipedia
# S&P 500 constituents page (data_fetch.get_sp500_constituents).
SECTOR_ETFS = {
    "Information Technology": "XLK",
    "Financials": "XLF",
    "Energy": "XLE",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Health Care": "XLV",
    "Industrials": "XLI",
    "Materials": "XLB",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
}

# Narrower thematic/sub-industry ETFs. Add or remove entries freely — the
# pipeline re-fetches this list on every run, no other code changes needed.
#
#   "Display Name": "TICKER"
#
# If the ticker is a State Street/SPDR product (ssga.com), its constituent
# list is pulled live from SSGA's daily holdings file (see
# SSGA_HOLDINGS_URL_TMPL / data_fetch.get_etf_holdings), so breadth, leader
# count and accumulation all work automatically.
#
# Any other ticker (VanEck, iShares, Invesco, ...) still gets ranked by
# SRS/Δ3D — the pipeline just can't compute per-constituent breadth for it
# without a holdings source, so those columns show blank for that row
# instead of failing the run.
THEME_ETFS = {
    "Semiconductors": "XSD",
    "Biotech": "IBB",
    "Cibersecurity": "CIBR",
    "Drones": "JEDI",
    "Rare Earths": "REMX",
    "Robotics": "ROBO",
    "Oil & Gas": "XOP",
    "Metals & Mining": "XME",
    "Software & Services": "XSW",
    "Tech-Software": "IGV",
    "Solar": "TAN",
    "Bitcoin Miners": "WGMI",
    "Photonics": "FOTO",
    "Mag7": "MAGS",
}

SSGA_HOLDINGS_URL_TMPL = (
    "https://www.ssga.com/us/en/intermediary/etfs/library-content/"
    "products/fund-data/etfs/us/holdings-daily-us-en-{ticker}.xlsx"
)

# --- Lookback windows (in trading days) ---
SRS_LOOKBACK = 20          # relative-return lookback used to build SRS
SRS_HISTORY_DAYS = 15      # how many days of SRS history to keep, for Δ3D etc.
DELTA_WINDOW = 3           # Δ3D window
MA_WINDOW = 50             # breadth: % of constituents above this SMA
BREADTH_TREND_WINDOW = 5   # days back to compare breadth direction (↑ → ↓)
HIGH_WINDOW = 20           # leader count: N-day-high breakout
HIGHER_LOW_SHORT = 5       # recent low window for higher-low check
HIGHER_LOW_LONG = 10       # prior low window for higher-low check
VOLUME_WINDOW = 10         # up/down volume accumulation window

# --- Trend-confirmation signals (EMA structure, volume, streaks) ---
EMA_FAST = 8
EMA_MID = 21
EMA_SLOW = 50
EMA_SLOPE_WINDOW = 3         # trading days back used to judge fast-EMA slope direction

VOLUME_AVG_WINDOW = 20       # baseline average-volume window
VOLUME_TREND_WINDOW = 10     # days back to compare that average against, for a volume trend
VOLUME_TREND_THRESHOLD_PCT = 0.05   # % change in avg volume to call it up/down vs flat

STREAK_MIN = 3               # consecutive up-days to count a stock as a "streak leader"

PRICE_HISTORY_PERIOD = "1y"   # yfinance download period (daily bars)

# Cap constituents fetched per sector/theme. None = use the full roster.
# Set a small int (e.g. 25) for a fast first run.
MAX_TICKERS_PER_SECTOR = None
MAX_TICKERS_PER_THEME = None

CACHE_MAX_AGE_HOURS = 20   # reuse cached price data if younger than this

# --- Status classification thresholds (SRS is min-max normalized 0-1 across sectors) ---
SRS_STRONG_THRESHOLD = 0.6
SRS_WEAK_THRESHOLD = 0.4
DELTA_RISING_THRESHOLD = 0.05
BREADTH_TREND_THRESHOLD_PP = 2.0   # percentage points of breadth change to call it a trend
