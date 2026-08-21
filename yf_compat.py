"""Environment compatibility shim for yfinance.

yfinance defaults to curl_cffi's "chrome" TLS impersonation (hardcoded in
yfinance._http.new_session) to get past Yahoo's bot detection. Inside Claude
Code's remote sandbox, that impersonated TLS handshake gets reset by the
session's MITM egress proxy (curl error 35) before a single request lands.
Plain, non-impersonated TLS survives the proxy but then gets bot-blocked by
Yahoo (HTTP 429 on every call, regardless of actual rate). Safari
impersonation clears both hurdles.

yfinance's own submodules (_http, data, base, multi, scrapers.history) each
capture their own `from ._http import new_session` reference at import time,
so patching yfinance._http alone is not enough -- every module that captured
a reference needs to be repatched directly. Call patch() once, before the
first yfinance network call (import order relative to `import yfinance`
doesn't matter, since sessions are only created lazily on first use).

Override the profile with YF_IMPERSONATE if a future yfinance/curl_cffi/proxy
combination needs something other than Safari.
"""
from __future__ import annotations
import os

_PROFILE = os.environ.get("YF_IMPERSONATE", "safari")
_patched = False


def patch() -> None:
    """No-ops (instead of raising) when the installed yfinance's internals don't
    match what this patch expects -- e.g. a different yfinance version on a local
    machine, where the sandbox's specific TLS/proxy issue doesn't apply anyway and
    plain yfinance already works. Only the cloud sandbox actually needs this."""
    global _patched
    if _patched:
        return
    try:
        import yfinance._http as _http
        import yfinance.data as _data
        import yfinance.base as _base
        import yfinance.multi as _multi
        import yfinance.scrapers.history as _history
    except (ImportError, AttributeError):
        _patched = True  # don't retry every call; this yfinance version just differs
        return

    def _new_session():
        if _http.HAS_CURL_CFFI:
            return _http._backend.Session(impersonate=_PROFILE)
        s = _http._backend.Session()
        s.headers.update({
            "User-Agent": _http._FALLBACK_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        return s

    for mod in (_http, _data, _base, _multi, _history):
        mod.new_session = _new_session

    # Drop any singleton session already built with the unpatched (chrome) profile.
    try:
        _data.YfData._instances.clear()
    except Exception:
        pass

    _patched = True
