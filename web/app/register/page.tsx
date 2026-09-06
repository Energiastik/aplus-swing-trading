"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage, type DictKey } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";

const ERROR_KEY: Record<string, DictKey> = {
  missing_email_or_password: "err_missing_email_or_password",
  invalid_email: "err_invalid_email",
  password_too_short: "err_password_too_short",
  email_already_registered: "err_email_already_registered",
  register_failed: "err_register_failed",
};

export default function RegisterPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        const key = ERROR_KEY[data.error];
        setError(key ? t(key) : t("err_generic_register"));
        setLoading(false);
        return;
      }
      router.push("/");
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
        <p className="auth-subtitle">{t("register_subtitle")}</p>

        <label className="auth-label" htmlFor="name">
          {t("name_optional")}
        </label>
        <input id="name" type="text" className="auth-input" value={name} onChange={(e) => setName(e.target.value)} />

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
          {t("password_min")}
        </label>
        <input
          id="password"
          type="password"
          className="auth-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? t("creating") : t("register_button")}
        </button>

        <p className="auth-switch">
          {t("have_account")} <Link href="/login">{t("login_link")}</Link>
        </p>
      </form>
    </main>
  );
}
