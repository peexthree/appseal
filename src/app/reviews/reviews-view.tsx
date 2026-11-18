"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/scanner/types";
import { Input } from "@/components/ui/input";

/** one approved review as the server page passes it (date pre-formatted) */
export interface ReviewCard {
  id: string;
  name: string;
  rating: number;
  host: string | null;
  body: string;
  date: string;
}

/** UI strings for the showcase and the submit form */
const D = {
  eyebrow: { ru: "Отзывы", en: "Reviews" },
  title: { ru: "Отзывы пользователей", en: "User reviews" },
  intro: {
    ru: "Каждый отзыв оставляет владелец проверенного приложения. Перед публикацией отзывы проходят короткую ручную проверку - никаких выдуманных цитат.",
    en: "Every review is left by an owner of a scanned app. Each one gets a short manual check before publishing - no invented quotes.",
  },
  aboutHost: { ru: "о домене", en: "about" },
  ratingAria: { ru: "Оценка {n} из 5", en: "Rated {n} out of 5" },
  emptyShowcase: {
    ru: "Отзывы пока собираются - ваш может быть первым.",
    en: "Reviews are just starting to come in - yours could be the first.",
  },
  toForm: { ru: "Оставить отзыв", en: "Leave a review" },
  formTitle: { ru: "Оставить отзыв", en: "Leave a review" },
  formNote: {
    ru: "Никаких email - только никнейм. Отзыв появится на витрине после короткой проверки.",
    en: "No email - just a nickname. Your review goes live after a short check.",
  },
  nameLabel: { ru: "Никнейм", en: "Nickname" },
  namePh: { ru: "как вас представить", en: "how to call you" },
  ratingLabel: { ru: "Оценка", en: "Rating" },
  ratingBtn: { ru: "Оценить на {n} из 5", en: "Rate {n} out of 5" },
  hostLabel: { ru: "Домен (необязательно)", en: "Domain (optional)" },
  hostPh: { ru: "myapp.com", en: "myapp.com" },
  bodyLabel: { ru: "Отзыв", en: "Review" },
  bodyPh: {
    ru: "Что проверяли и что получилось - своими словами",
    en: "What you scanned and how it went - in your own words",
  },
  bodyHint: { ru: "От 10 до 500 символов", en: "From 10 to 500 characters" },
  consentLabel: {
    ru: "Согласен на публикацию никнейма, оценки и текста на витрине",
    en: "I agree to publish my nickname, rating and text on this page",
  },
  hintName: { ru: "Укажите никнейм - от 2 символов", en: "Add a nickname - at least 2 characters" },
  hintRating: { ru: "Поставьте оценку звёздами", en: "Pick a star rating" },
  hintBody: { ru: "Расскажите чуть подробнее - минимум 10 символов", en: "Tell a bit more - at least 10 characters" },
  hintConsent: {
    ru: "Подтвердите согласие на публикацию - без него отзыв не отправляется",
    en: "Please confirm the publication consent - the review is not sent without it",
  },
  hintHost: { ru: "Домен в формате myapp.com - или оставьте поле пустым", en: "Use a domain like myapp.com - or leave the field empty" },
  okMsg: {
    ru: "Спасибо! Отзыв появится на витрине после короткой проверки.",
    en: "Thanks! Your review will appear on this page after a short check.",
  },
  rateMsg: { ru: "Слишком много отзывов за день - попробуйте завтра", en: "Too many reviews today - please try again tomorrow" },
  downMsg: { ru: "Отзывы временно недоступны", en: "Reviews are temporarily unavailable" },
  netMsg: {
    ru: "Не удалось отправить отзыв. Проверьте соединение и попробуйте ещё раз.",
    en: "Could not send the review. Check your connection and try again.",
  },
  submitBtn: { ru: "Отправить отзыв", en: "Send review" },
  sending: { ru: "Отправляем...", en: "Sending..." },
} as const;

type Status = "idle" | "sending" | "ok" | "rate" | "down" | "net";

/** strict domain shape (mirrors the API and passes.ts): lowercase, no www */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** same normalization the API applies: lowercase, no protocol/path/www */
function normalizeHost(raw: string): string | null {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
  return clean && HOST_RE.test(clean) ? clean : null;
}

/** read-only star row: plain characters, the meaning rides on aria-label */
function Stars({ rating, lang }: { rating: number; lang: Lang }) {
  const n = Math.max(1, Math.min(5, rating));
  return (
    <span
      role="img"
      aria-label={D.ratingAria[lang].replace("{n}", String(n))}
      className="shrink-0 text-sm tracking-widest text-amber-400"
    >
      <span aria-hidden>{"★".repeat(n)}</span>
      <span aria-hidden className="text-slate-600">
        {"☆".repeat(5 - n)}
      </span>
    </span>
  );
}

export function ReviewsView({ reviews, lang }: { reviews: ReviewCard[]; lang: Lang }) {
  const t = (k: keyof typeof D) => D[k][lang];

  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [host, setHost] = useState("");
  const [text, setText] = useState("");
  // publication consent (152-FZ): the nickname goes public, so the send must
  // be explicitly confirmed - unchecked submissions never reach the API
  const [consent, setConsent] = useState(false);
  // honeypot: visually hidden input humans never see or fill
  const [website, setWebsite] = useState("");
  const [hint, setHint] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const scrollToForm = () =>
    document.getElementById("submit")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nick = name.trim();
    const body = text.trim();
    if (nick.length < 2 || nick.length > 40) {
      setHint(t("hintName"));
      return;
    }
    if (rating < 1 || rating > 5) {
      setHint(t("hintRating"));
      return;
    }
    if (body.length < 10) {
      setHint(t("hintBody"));
      return;
    }
    const cleanHost = normalizeHost(host);
    if (host.trim() && !cleanHost) {
      setHint(t("hintHost"));
      return;
    }
    if (!consent) {
      setHint(t("hintConsent"));
      return;
    }
    setHint("");
    setStatus("sending");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nick,
          rating,
          host: cleanHost ?? "",
          body,
          lang,
          consent,
          website,
        }),
      });
      if (res.ok) {
        setStatus("ok");
        setName("");
        setRating(0);
        setHost("");
        setText("");
        setConsent(false);
        setWebsite("");
        return;
      }
      if (res.status === 429) {
        setStatus("rate");
        return;
      }
      if (res.status === 503) {
        setStatus("down");
        return;
      }
      setStatus("net");
    } catch {
      setStatus("net");
    }
  };

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">{t("eyebrow")}</p>
      <h1 className="font-display mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">{t("intro")}</p>

      {/* showcase: approved reviews only, newest first */}
      {reviews.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.id} className="appseal-glass-card flex flex-col rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <figcaption className="min-w-0 truncate text-sm font-bold text-slate-100">
                  {r.name}
                </figcaption>
                <Stars rating={r.rating} lang={lang} />
              </div>
              {r.host && (
                <Link
                  href={`/verified/${r.host}`}
                  className="mt-1.5 w-fit text-[11px] font-semibold text-sky-400 transition hover:text-sky-300"
                >
                  {t("aboutHost")} <span className="font-mono">{r.host}</span>
                </Link>
              )}
              <blockquote className="mt-3 flex-1 text-[13px] leading-relaxed text-slate-300">
                {r.body}
              </blockquote>
              <time className="mt-3 text-[11px] text-slate-500">{r.date}</time>
            </figure>
          ))}
        </div>
      ) : (
        <div className="appseal-glass-card mt-8 rounded-2xl p-8 text-center">
          <p className="text-sm leading-relaxed text-slate-400">{t("emptyShowcase")}</p>
          <button
            type="button"
            onClick={scrollToForm}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
          >
            {t("toForm")}
          </button>
        </div>
      )}

      {/* submit form */}
      <section id="submit" className="mt-14 scroll-mt-24">
        <h2 className="font-display text-xl font-extrabold text-slate-100">{t("formTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("formNote")}</p>
        <form onSubmit={onSubmit} noValidate className="appseal-glass-card mt-5 rounded-2xl p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="rv-name"
                className="text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                {t("nameLabel")}
              </label>
              <Input
                id="rv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder={t("namePh")}
                autoComplete="off"
                className="mt-2 h-10 w-full border-slate-700 bg-[#111827] text-sm text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("ratingLabel")}
              </span>
              <div role="group" aria-label={t("ratingLabel")} className="mt-2.5 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={t("ratingBtn").replace("{n}", String(n))}
                    aria-pressed={rating >= n}
                    className={`text-2xl leading-none transition-colors ${
                      n <= rating ? "text-amber-400" : "text-slate-600 hover:text-amber-200"
                    }`}
                  >
                    <span aria-hidden>{n <= rating ? "★" : "☆"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label
              htmlFor="rv-host"
              className="text-[11px] font-bold uppercase tracking-wider text-slate-400"
            >
              {t("hostLabel")}
            </label>
            <Input
              id="rv-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t("hostPh")}
              autoComplete="off"
              inputMode="url"
              className="mt-2 h-10 w-full border-slate-700 bg-[#111827] font-mono text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="rv-body"
                className="text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                {t("bodyLabel")}
              </label>
              <span className="font-mono text-[11px] text-slate-500">{text.length}/500</span>
            </div>
            <textarea
              id="rv-body"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder={t("bodyPh")}
              className="mt-2 w-full resize-y rounded-md border border-slate-700 bg-[#111827] px-3 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">{t("bodyHint")}</p>
          </div>
          {/* publication consent: an honest checkbox, not a pre-ticked one -
              the reviewer decides, matching the /legal reviews section */}
          <label
            htmlFor="rv-consent"
            className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-slate-400"
          >
            <input
              id="rv-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400"
            />
            <span>{t("consentLabel")}</span>
          </label>
          {/* honeypot: hidden from humans and the tab order; bots autofilling
              every field reveal themselves here and the API drops the submit */}
          <div aria-hidden="true" className="sr-only">
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          {hint && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-amber-400">
              {hint}
            </p>
          )}
          {status === "ok" && (
            <p role="status" className="mt-3 text-[13px] font-semibold text-emerald-400">
              {t("okMsg")}
            </p>
          )}
          {status === "rate" && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-amber-400">
              {t("rateMsg")}
            </p>
          )}
          {status === "down" && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-red-400">
              {t("downMsg")}
            </p>
          )}
          {status === "net" && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-red-400">
              {t("netMsg")}
            </p>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-400 px-6 text-sm font-bold text-[#090d16] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "sending" ? t("sending") : t("submitBtn")}
          </button>
        </form>
      </section>
    </div>
  );
}
