"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_RU: Record<string, string> = {
  missing_email_or_password: "Введите email и пароль.",
  invalid_credentials: "Неверный email или пароль.",
  login_failed: "Ошибка сервера. Попробуйте ещё раз.",
};

function LoginForm() {
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
        setError(ERROR_RU[data.error] || "Не удалось войти.");
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">A+ Swing Trading</h1>
        <p className="auth-subtitle">Войдите, чтобы открыть дашборд</p>

        <label className="auth-label" htmlFor="email">
          Email
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
          Пароль
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
          {loading ? "Входим…" : "Войти"}
        </button>

        <p className="auth-switch">
          Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
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
