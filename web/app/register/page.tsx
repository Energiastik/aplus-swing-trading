"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ERROR_RU: Record<string, string> = {
  missing_email_or_password: "Введите email и пароль.",
  invalid_email: "Некорректный email.",
  password_too_short: "Пароль должен быть не короче 8 символов.",
  email_already_registered: "Этот email уже зарегистрирован — войдите вместо регистрации.",
  register_failed: "Ошибка сервера. Попробуйте ещё раз.",
};

export default function RegisterPage() {
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
        setError(ERROR_RU[data.error] || "Не удалось зарегистрироваться.");
        setLoading(false);
        return;
      }
      router.push("/");
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
        <p className="auth-subtitle">Создайте аккаунт для доступа к дашборду</p>

        <label className="auth-label" htmlFor="name">
          Имя (необязательно)
        </label>
        <input id="name" type="text" className="auth-input" value={name} onChange={(e) => setName(e.target.value)} />

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
          Пароль (минимум 8 символов)
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
          {loading ? "Создаём…" : "Зарегистрироваться"}
        </button>

        <p className="auth-switch">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
      </form>
    </main>
  );
}
