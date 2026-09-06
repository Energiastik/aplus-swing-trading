"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

export default function LogoutButton() {
  const { t } = useLanguage();
  const router = useRouter();

  async function onClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={onClick} type="button">
      {t("logout")}
    </button>
  );
}
