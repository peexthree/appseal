"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/lib/scanner/types";

const CONSENT_KEY = "appseal-cookie-consent";
const CONSENT_EVENT = "appseal:cookie-consent";

export type CookieConsentValue = "granted" | "denied";

// null = выбор ещё не сделан, баннер должен показываться
export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CONSENT_KEY);
  return raw === "granted" || raw === "denied" ? raw : null;
}

export function setCookieConsent(value: CookieConsentValue) {
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}

// отзыв согласия: снимаем флаг и показываем баннер снова
export function resetCookieConsent() {
  window.localStorage.removeItem(CONSENT_KEY);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}

export function useCookieConsent(): CookieConsentValue | null {
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);
  useEffect(() => {
    const sync = () => setConsent(getCookieConsent());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);
  return consent;
}

const COPY = {
  title: { ru: "Cookie и аналитика", en: "Cookies & analytics" },
  // полоса - одна строка: только счётчик и гейт до согласия; полный текст
  // 152-ФЗ живёт на /legal (ссылка в строке), повторять его тут нечего
  bodyA: {
    ru: "Метрика № 114397545 ставит cookie. Без согласия счётчик не загружается. Детали - в ",
    en: "Metrica no. 114397545 sets cookies. Without consent the counter stays off. Details in the ",
  },
  bodyLink: { ru: "правилах сервиса", en: "service terms" },
  accept: { ru: "Принять", en: "Accept" },
  deny: { ru: "Отклонить", en: "Decline" },
  aria: { ru: "Согласие на cookie-файлы и аналитику", en: "Cookie and analytics consent" },
} as const;

// Статус согласия + управление им на странице /legal
export function CookiePrefs() {
  const consent = useCookieConsent();
  const lang: Lang = useLang();
  const status =
    consent === "granted"
      ? lang === "en"
        ? "granted, Yandex.Metrica loads"
        : "выдано, Яндекс.Метрика загружается"
      : consent === "denied"
        ? lang === "en"
          ? "declined, the counter stays off"
          : "отклонено, счётчик не загружается"
        : lang === "en"
          ? "not chosen yet"
          : "ещё не выбрано";
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-800 bg-[#090d16] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-400">
        {lang === "en" ? "Analytics consent: " : "Согласие на аналитику: "}
        <span className="font-semibold text-slate-200">{status}</span>
      </p>
      <button
        onClick={resetCookieConsent}
        className="shrink-0 rounded-md border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
      >
        {lang === "en" ? "Reset and choose again" : "Сбросить и выбрать заново"}
      </button>
    </div>
  );
}

export function CookieConsent() {
  const consent = useCookieConsent();
  const lang: Lang = useLang();
  const reduceMotion = useReducedMotion();
  if (consent !== null) return null;

  // компактная нижняя полоса вместо карточки: текст слева, кнопки справа,
  // на мобайле - колонка (текст <= 2 строк, кнопки в ряд) + safe-area снизу
  return (
    <motion.div
      role="dialog"
      aria-label={COPY.aria[lang]}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/[0.07] bg-[rgba(9,13,22,0.85)] backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-5 sm:py-3.5">
        <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-slate-400 sm:line-clamp-1">
          {COPY.bodyA[lang]}
          <Link
            href="/legal"
            className="text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
          >
            {COPY.bodyLink[lang]}
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setCookieConsent("granted")}
            className="flex-1 rounded-full border border-sky-400/40 bg-sky-400/10 px-3.5 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20 sm:flex-none"
          >
            {COPY.accept[lang]}
          </button>
          <button
            onClick={() => setCookieConsent("denied")}
            className="flex-1 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-200 sm:flex-none"
          >
            {COPY.deny[lang]}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
