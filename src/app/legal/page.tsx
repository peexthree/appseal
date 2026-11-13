import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, Lock, Globe, AlertTriangle } from "@/components/icons/appseal-icons";

export const metadata: Metadata = {
  title: "AppSeal — Правила использования, данные и отказ от ответственности",
  description:
    "Правила использования сканера AppSeal, принципы обработки данных, порядок удаления записей из публичного реестра и отказ от ответственности.",
};

const CONTACT_EMAIL = "linedrop@yandex.ru";

export default function LegalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#090d16]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="AppSeal home">
            <img
              src="/ico.svg"
              alt="AppSeal"
              width={28}
              height={28}
              className="h-7 w-7 object-contain drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)] transition-transform hover:scale-105"
            />
            <span className="font-display text-lg font-extrabold tracking-tight">AppSeal</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/registry"
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
            >
              Реестр
            </Link>
            <Link
              href="/"
              className="rounded-md bg-sky-400 px-3.5 py-1.5 text-xs font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Сканер
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
                Terms · Data · Disclaimer
              </p>
              <h1 className="font-display text-2xl font-extrabold text-slate-50 sm:text-3xl">
                Правила использования сервиса AppSeal
              </h1>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Сервис AppSeal (далее - «Сервис») ведётся частным лицом и предоставляет бесплатный
            автоматизированный инструмент внешней проверки базовой конфигурации безопасности
            веб-приложений. По всем вопросам, включая запросы на удаление данных, обращайтесь:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <div className="mt-4 rounded-xl border border-slate-800 bg-[#090d16] p-4 text-[13px] leading-relaxed text-slate-300">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">Оператор сервиса</p>
            <p className="mt-2">
              Сычёв Игорь Матвеевич - самозанятый, применяющий специальный налоговый режим
              «Налог на профессиональный доход» (Федеральный закон № 422-ФЗ).
            </p>
            <p className="mt-1 font-mono text-xs text-slate-400">
              ИНН: 026906141678 · e-mail: {CONTACT_EMAIL}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Реквизиты указаны в соответствии с ч. 4 ст. 4 Федерального закона № 422-ФЗ.
              Платежи обрабатывает ООО НКО «ЮМани» (ЮKassa), ОГРН 1127711000031, лицензия
              Банка России № 3510-К; чек направляется плательщику автоматически.
            </p>
          </div>

          <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-300">
            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-sky-400" />
                1. Правила использования
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  Запускать проверку можно только в отношении ресурсов, которыми вы владеете или
                  разрабатываете, либо получив разрешение их владельца. Это условие подтверждается
                  чекбоксом при запуске скана.
                </li>
                <li>
                  Скан выполняется в исключительно пассивном режиме: стандартные HTTP-запросы
                  <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">GET</code>/
                  <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">HEAD</code>/
                  <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">OPTIONS</code>
                  к публично доступным страницам. Попытки входа, взлома, инъекций и нагрузочного
                  воздействия не производятся.
                </li>
                <li>
                  Запрещены автоматизированное использование Сервиса в обход интерфейса, попытки
                  обхода ограничений частоты запросов и использование результатов Сервиса для
                  неправомерного доступа к чужим системам.
                </li>
                <li>Сервис вправе отказать в проверке любого ресурса без объяснения причин.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Lock className="h-4 w-4 text-sky-400" />
                2. Обработка данных
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  Регистрация отсутствует, формы для ввода персональных данных не используются.
                  Сервис не собирает ФИО, адреса электронной почты, телефоны, не использует
                  cookie-файлы и системы веб-аналитики.
                </li>
                <li>
                  Исключение - покупка Launch Pass: адрес электронной почты плательщика
                  обрабатывается только транзитом и передаётся платёжному провайдеру ЮKassa для
                  формирования чека и идентификации платежа. Оператор электронную почту не хранит:
                  у оператора остаются лишь неперсональные данные - идентификатор платежа, домен
                  пропуска и срок его действия (в течение 8 дней). Оператор не публикует эти
                  сведения и не передаёт их третьим лицам, кроме ЮKassa и налоговых органов.
                </li>
                <li>
                  В localStorage браузера хранится только выбранный язык интерфейса. Эти данные не
                  покидают ваш браузер.
                </li>
                <li>
                  Результаты проверки (адрес/домен ресурса, дата, оценка, перечень найденных
                  замечаний) сохраняются в базе Сервиса и могут публиковаться в открытом реестре{" "}
                  <Link href="/registry" className="text-sky-400 hover:text-sky-300">/registry</Link>,
                  в том числе со ссылкой на проверенный ресурс.
                </li>
                <li>
                  Инфраструктурные журналы обращений (IP-адрес, время запроса) обрабатывают
                  поставщики инфраструктуры Сервиса - Vercel Inc. и Cloudflare, Inc. - в
                  соответствии с их собственными политиками. Сервис не распоряжается этими
                  журналами самостоятельно.
                </li>
                <li>
                  Содержимое обнаруженных в ходе скана файлов и секретов не сохраняется: данные
                  принудительно маскируются (см.{" "}
                  <Link href="/bot" className="text-sky-400 hover:text-sky-300">политику сканера</Link>).
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Globe className="h-4 w-4 text-sky-400" />
                3. Публичный реестр и удаление записей
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  Владелец ресурса вправе запросить исключение его записи из публичного реестра -
                  направьте письмо на{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                  >
                    {CONTACT_EMAIL}
                  </a>{" "}
                  с указанием домена. Запрос обрабатывается в течение 3 рабочих дней.
                </li>
                <li>
                  Чтобы полностью запретить сканирование своего ресурса, добавьте в robots.txt
                  директиву{" "}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
                    User-agent: AppSeal-Scanner · Disallow: /
                  </code>{" "}
                  - сканер прекращает проверку с уведомлением пользователя.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                4. Отказ от ответственности
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  Результаты проверки носят исключительно информационный характер, формируются
                  автоматизированной эвристикой и <strong className="text-slate-100">не являются</strong>{" "}
                  заключением аудита безопасности, гарантией отсутствия уязвимостей или
                  подтверждением соответствия требованиям регуляторов.
                </li>
                <li>
                  Сервис предоставляется «как есть», без каких-либо гарантий. Оператор не несёт
                  ответственности за решения, принятые на основе результатов проверки, и за прямой
                  или косвенный ущерб, связанный с использованием Сервиса.
                </li>
                <li>
                  Материалы Сервиса не являются публичной офертой. К отношениям по использованию
                  Сервиса применяется законодательство Российской Федерации.
                </li>
              </ul>
            </section>

            <section className="rounded-xl border border-slate-800 bg-[#090d16] p-5">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
                Summary in English
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 text-slate-400">
                <li>
                  AppSeal is run by a private individual. Contact for all matters, including
                  registry removal requests:{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-mono text-sky-400 hover:text-sky-300"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </li>
                <li>
                  Scan only resources you own, develop, or are authorized to test. Checks are
                  strictly passive (public GET/HEAD/OPTIONS responses only).
                </li>
                <li>
                  No accounts, no forms, no cookies, no analytics (exception: the buyer&apos;s email
                  during a Launch Pass purchase is processed in transit and handed to the payment
                  provider YooKassa for the receipt - the operator does not store it; only the
                  payment id, pass domain and expiry stay on our side). Only the chosen UI
                  language is kept in your browser. Scan results (domain, date, grade) may be
                  published in the public registry; domain owners may request removal by email
                  (processed within 3 business days). Request logs are handled by infrastructure
                  providers Vercel and Cloudflare under their own policies.
                </li>
                <li>
                  Results are automated heuristic findings - not a security audit, not a guarantee,
                  provided &quot;as is&quot;. Russian law applies.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · Terms, Data &amp; Disclaimer
            </p>
            <p className="font-mono text-[10px] text-slate-700">
              <Link href="/" className="transition hover:text-slate-500">главная</Link> · <Link href="/registry" className="transition hover:text-slate-500">реестр</Link> · <Link href="/bot" className="transition hover:text-slate-500">робот</Link>
            </p>
          </div>
          <div className="shrink-0 transition-transform hover:scale-[1.02]">
            <a
              href="/?report=mweys4fr-0d7b05c638"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified: Grade A+ (100/100)"
              className="inline-block"
            >
              <img
                src="/api/badge?id=mweys4fr-0d7b05c638"
                alt="AppSeal Verified: Grade A+"
                width={228}
                height={44}
                className="h-[44px] w-[228px] drop-shadow-[0_4px_16px_rgba(192,132,252,0.18)]"
              />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
