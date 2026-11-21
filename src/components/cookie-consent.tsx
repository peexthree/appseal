"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  // banner copy stays one-to-two lines: the full 152-FZ text lives in /legal
  // (the link below), the banner only names the counter, the data and the
  // until-you-agree gate - repeating five lines here ate ~40% of a phone
  // viewport on every first visit
  bodyA: {
    ru: "Метрика (счётчик № 114397545) ставит cookie и обрабатывает обезличенные данные визита - IP, источник, поведение. Пока вы не согласитесь, счётчик не загружается. Подробности - в ",
    en: "Yandex.Metrica (counter no. 114397545) sets cookies and processes de-identified visit data - IP, traffic source, on-page behaviour. Until you agree, the counter stays off. Details - in the ",
  },
  bodyLink: { ru: "правилах сервиса", en: "service terms" },
  accept: { ru: "Принять - включить Метрику", en: "Accept - enable Metrica" },
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
  if (consent !== null) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-3 sm:px-4 sm:pb-5">
      <div
        role="dialog"
        aria-label={COPY.aria[lang]}
        className="appseal-dropdown w-full max-w-2xl rounded-xl p-3.5 sm:p-4"
      >
        <p className="text-[13px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-100">{COPY.title[lang]}: </span>
          {COPY.bodyA[lang]}
          <Link
            href="/legal"
            className="text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
          >
            {COPY.bodyLink[lang]}
          </Link>
          .
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => setCookieConsent("granted")}
            className="flex-1 rounded-md bg-sky-400 px-4 py-2 text-xs font-bold text-[#090d16] transition hover:bg-sky-300 sm:flex-none"
          >
            {COPY.accept[lang]}
          </button>
          <button
            onClick={() => setCookieConsent("denied")}
            className="rounded-md border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            {COPY.deny[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}
