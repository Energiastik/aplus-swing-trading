"use client";

import { useLanguage } from "@/lib/i18n";

export default function LangToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="lang-toggle" role="group" aria-label="Language / Язык">
      <button
        type="button"
        className={lang === "ru" ? "lang-toggle-active" : ""}
        onClick={() => setLang("ru")}
      >
        RU
      </button>
      <button
        type="button"
        className={lang === "en" ? "lang-toggle-active" : ""}
        onClick={() => setLang("en")}
      >
        EN
      </button>
    </div>
  );
}
