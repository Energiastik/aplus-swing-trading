"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage, type DictKey } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";

const ERROR_KEY: Record<string, DictKey> = {
  missing_email_or_password: "err_missing_email_or_password",
  invalid_credentials: "err_invalid_credentials",
  login_failed: "err_login_failed",
};

function LoginForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const key = ERROR_KEY[data.error];
        setError(key ? t(key) : t("err_generic_login"));
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t("err_network"));
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
          <LangToggle />
        </div>
        <h1 className="auth-title">{t("login_title")}</h1>
        <p className="auth-subtitle">{t("login_subtitle")}</p>

        <label className="auth-label" htmlFor="email">
          {t("email")}
        </label>
        <input
          id="email"
          type="email"
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <label className="auth-label" htmlFor="password">
          {t("password")}
        </label>
        <input
          id="password"
          type="password"
          className="auth-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? t("logging_in") : t("login_button")}
        </button>

        <p className="auth-switch">
          {t("no_account")} <Link href="/register">{t("register_link")}</Link>
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
