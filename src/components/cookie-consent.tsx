"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "@/components/icons/appseal-icons";

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

// Статус согласия + управление им на странице /legal
export function CookiePrefs() {
  const consent = useCookieConsent();
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-800 bg-[#090d16] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-400">
        Согласие на аналитику:{" "}
        <span className="font-semibold text-slate-200">
          {consent === "granted"
            ? "выдано, Яндекс.Метрика загружается"
            : consent === "denied"
              ? "отклонено, счётчик не загружается"
              : "ещё не выбрано"}
        </span>
      </p>
      <button
        onClick={resetCookieConsent}
        className="shrink-0 rounded-md border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
      >
        Сбросить и выбрать заново
      </button>
    </div>
  );
}

export function CookieConsent() {
  const consent = useCookieConsent();
  if (consent !== null) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 sm:pb-6">
      <div
        role="dialog"
        aria-label="Согласие на cookie-файлы и аналитику"
        className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-[#111827]/95 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur sm:p-5"
      >
        <div className="flex gap-3">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/15 text-sky-400 sm:flex">
            <Info size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100">Cookie и аналитика</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              Для статистики посещаемости сайт подключает Яндекс.Метрику (счётчик № 114248324):
              она ставит cookie-файлы и обрабатывает обезличенные данные визита - IP-адрес,
              источник перехода, поведение на странице. Пока вы не согласитесь, счётчик не
              загружается. Подробности - в{" "}
              <Link
                href="/legal"
                className="text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
              >
                правилах сервиса
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setCookieConsent("granted")}
                className="rounded-md bg-sky-400 px-4 py-2 text-xs font-bold text-[#090d16] transition hover:bg-sky-300"
              >
                Принять - включить Метрику
              </button>
              <button
                onClick={() => setCookieConsent("denied")}
                className="rounded-md border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Отклонить - статистика останется выключенной
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
