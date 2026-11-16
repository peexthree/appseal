import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CopyCode } from "../fixes/copy-code";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AppSeal API: живой класс домена в JSON и бейдж для сайта",
  description:
    "Публичный JSON API AppSeal: GET /api/verify отдаёт актуальную оценку A+-E любого домена из реестра, GET /api/badge рисует бейдж с живым классом. Без ключей и регистрации.",
  alternates: { canonical: "/api" },
};

const CURL = `curl "https://appseal.online/api/verify?host=appseal.online"`;

const RESPONSE = `{
  "host": "appseal.online",
  "grade": "A+",
  "score": 97,
  "checkedAt": "2026-11-16T19:24:53.989Z",
  "profile": "https://appseal.online/verified/appseal.online",
  "badge": "https://appseal.online/api/badge?host=appseal.online",
  "seal": "AppSeal Security Verified"
}`;

const FETCH_JS = `const res = await fetch(
  "https://appseal.online/api/verify?host=" + encodeURIComponent(host),
);
if (res.ok) {
  const { grade, score, profile } = await res.json();
  console.log(\`\${host}: \${grade} (\${score}/100) - \${profile}\`);
}`;

const BADGE_IMG = `<a href="https://appseal.online/verified/your-domain.com">
  <img src="https://appseal.online/api/badge?host=your-domain.com" width="228" height="44" alt="AppSeal Security Verified">
</a>`;

const BADGE_TROPHY = `<!-- 512x512 кубок вместо полоски, тёмная тема по умолчанию -->
<img src="https://appseal.online/api/badge?host=your-domain.com&style=trophy" width="80" height="80" alt="AppSeal Trophy">

<!-- светлая тема для белых страниц -->
<img src="https://appseal.online/api/badge?host=your-domain.com&theme=light" width="228" height="44" alt="AppSeal Security Verified">`;

export default function ApiPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">AppSeal API</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Живой класс домена в JSON
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Публичный API без ключей и регистрации: оценка A+-E любого домена из открытого реестра,
          свежая не старше последнего скана. Два эндпоинта - JSON для дашбордов, ботов и статей,
          и SVG-бейдж для сайта и README. Отдаются только агрегаты: класс и дата проверки,
          без находок сканера.
        </p>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">GET /api/verify</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
            <div className="flex items-center gap-4 border-b border-slate-800/60 px-5 py-3 text-sm">
              <span className="w-40 shrink-0 font-mono text-xs font-bold text-sky-400">host</span>
              <span className="flex-1 text-xs text-slate-400">обязательно - домен в любом регистре, можно без протокола</span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">запрос</span>
              <CopyCode code={CURL} label="Скопировать curl" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {CURL}
            </pre>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">ответ 200</span>
              <CopyCode code={RESPONSE} label="Скопировать ответ" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {RESPONSE}
            </pre>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
              <p className="font-mono text-xs font-bold text-amber-400">400 invalid_host</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Домен не подходит под формат. Ответ: <span className="font-mono text-slate-300">{`{"error":"invalid_host"}`}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
              <p className="font-mono text-xs font-bold text-red-400">404 not_scanned</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Домен ещё не сканился. В ответе подсказка со ссылкой на бесплатный скан.
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Ответ кешируется на 5 минут (Cache-Control: public, max-age=300) - можно опрашивать
            спокойно, лимит практично не встречается.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">Пример на JS</h2>
          <div className="mt-3 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">fetch</span>
              <CopyCode code={FETCH_JS} label="Скопировать код" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {FETCH_JS}
            </pre>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">GET /api/badge - бейдж для сайта и README</h2>
          <p className="mt-2 text-sm text-slate-400">
            SVG-картинка, привязанная к домену: класс на ней обновляется сам после каждого скана.
            В HTML:
          </p>
          <div className="mt-3 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">HTML</span>
              <CopyCode code={BADGE_IMG} label="Скопировать HTML" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {BADGE_IMG}
            </pre>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Варианты: <span className="font-mono text-xs text-slate-300">style=trophy</span> - кубок 512x512
            вместо полоски, <span className="font-mono text-xs text-slate-300">theme=light</span> - светлая тема.
            Для README есть готовый Markdown на{" "}
            <Link href="/ci" className="font-bold text-sky-400 hover:underline">
              странице CI-гейта →
            </Link>
          </p>
          <div className="mt-3 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">варианты бейджа</span>
              <CopyCode code={BADGE_TROPHY} label="Скопировать" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {BADGE_TROPHY}
            </pre>
          </div>
        </section>

        <div className="mt-10 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-6">
          <p className="text-sm text-slate-300">
            Домена нет в ответе?{" "}
            <Link href="/" className="font-bold text-sky-400 hover:underline">
              Запустите бесплатный скан →
            </Link>{" "}
            Он попадёт в реестр, и API сразу начнёт отвечать за него. Гонять сканы на каждый пуш
            удобнее через{" "}
            <Link href="/ci" className="font-bold text-sky-400 hover:underline">
              GitHub Action →
            </Link>
          </p>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-3">
            <Link href="/ci" className="transition hover:text-slate-400">CI-гейт</Link>
            <Link href="/fixes" className="transition hover:text-slate-400">гайды</Link>
            <Link href="/stats" className="transition hover:text-slate-400">статистика</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
