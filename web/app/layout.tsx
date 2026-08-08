import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A+ Swing Trading — Дашборд",
  description: "Ежедневный свинг-скрининг: режим рынка, ротация секторов, кандидаты",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
