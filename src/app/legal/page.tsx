import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Ambient } from "@/components/ambient";
import { FileCheck2, Lock, Globe, AlertTriangle } from "@/components/icons/appseal-icons";
import { CookiePrefs } from "@/components/cookie-consent";
import { pageLang } from "@/lib/lang-server";
import type { Lang } from "@/lib/scanner/types";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await pageLang();
  return lang === "en"
    ? {
        title: "AppSeal - Terms of Use, Data Handling & Disclaimer",
        description:
          "AppSeal scanner rules, data handling principles, public registry removal procedure and disclaimer.",
        alternates: { canonical: "/legal" },
      }
    : {
        title: "AppSeal - Правила использования, данные и отказ от ответственности",
        description:
          "Правила использования сканера AppSeal, принципы обработки данных, порядок удаления записей из публичного реестра и отказ от ответственности.",
        alternates: { canonical: "/legal" },
      };
}

const CONTACT_EMAIL = "security@appseal.online";

const D = {
  eyebrow: { ru: "Правила и данные", en: "Rules & data" },
  h1: { ru: "Правила использования сервиса AppSeal", en: "AppSeal Service Terms, Data & Disclaimer" },
  introA: {
    ru: "Сервис AppSeal (далее - «Сервис») ведётся частным лицом и предоставляет бесплатный автоматизированный инструмент внешней проверки базовой конфигурации безопасности веб-приложений. По всем вопросам, включая запросы на удаление данных, обращайтесь: ",
    en: "The AppSeal service (the \"Service\") is run by a private individual and provides a free automated tool that checks the basic security configuration of web apps from the outside. For all matters, including data removal requests, contact: ",
  },
  operatorEyebrow: { ru: "Оператор сервиса", en: "Service operator" },
  operatorWho: {
    ru: "Сычёв Игорь Матвеевич - самозанятый, применяющий специальный налоговый режим «Налог на профессиональный доход» (Федеральный закон № 422-ФЗ).",
    en: "Sychev Igor Matveevich - a Russian self-employed professional under the special \"professional income tax\" regime (Federal Law No. 422-FZ).",
  },
  operatorRequisites: {
    ru: "Реквизиты указаны в соответствии с ч. 4 ст. 4 Федерального закона № 422-ФЗ. Платежи обрабатывает ООО НКО «ЮМани» (ЮKassa), ОГРН 1127711000031, лицензия Банка России № 3510-К; чек направляется плательщику автоматически.",
    en: "Details are given per Art. 4(4) of Federal Law No. 422-FZ. Payments are processed by OOO NKO YooMoney (YooKassa), PSRN 1127711000031, Bank of Russia license No. 3510-K; the receipt is sent to the payer automatically.",
  },
  s1Title: { ru: "1. Правила использования", en: "1. Rules of use" },
  s1a: {
    ru: "Запускать проверку можно только в отношении ресурсов, которыми вы владеете или разрабатываете, либо получив разрешение их владельца. Это условие подтверждается чекбоксом при запуске скана.",
    en: "You may only scan resources you own or develop, or with the owner's permission. You confirm this with a checkbox when starting a scan.",
  },
  s1bA: {
    ru: "Скан выполняется в пассивном режиме: стандартные HTTP-запросы ",
    en: "The scan runs in passive mode: standard HTTP ",
  },
  s1bB: {
    ru: " к публично доступным страницам. Для страниц, отрисовываемых только в браузере (SPA), движок дополнительно открывает страницу в headless-браузере и читает уже собранную разметку - без ввода данных, авторизации и отправки форм. Попытки входа, взлома, инъекций и нагрузочного воздействия не производятся.",
    en: " requests to publicly reachable pages. For pages rendered only in the browser (SPA), the engine additionally opens the page in a headless browser and reads the already-assembled markup - no data entry, no authentication, no form submission. No login attempts, exploits, injections or load testing are performed.",
  },
  s1c: {
    ru: "Запрещены автоматизированное использование Сервиса в обход интерфейса, попытки обхода ограничений частоты запросов и использование результатов Сервиса для неправомерного доступа к чужим системам.",
    en: "Automated use of the Service outside its interface, attempts to bypass request-rate limits, and use of the Service results for unauthorized access to third-party systems are prohibited.",
  },
  s1d: {
    ru: "Сервис вправе отказать в проверке любого ресурса без объяснения причин.",
    en: "The Service may refuse to scan any resource without giving a reason.",
  },
  s2Title: { ru: "2. Обработка данных", en: "2. Data handling" },
  s2a: {
    ru: "Регистрация отсутствует, формы для ввода персональных данных не используются. Сервис не собирает ФИО, адреса электронной почты и телефоны.",
    en: "There is no registration and no personal-data forms. The Service does not collect names, email addresses or phone numbers.",
  },
  s2bA: {
    ru: "Веб-аналитика - счётчик Яндекс.Метрики № 114397545 (ООО «ЯНДЕКС»): в целях статистики посещаемости и улучшения интерфейса обрабатываются обезличенные данные посещений - cookie-файлы, IP-адрес, параметры визита. Обработка ведётся Яндексом по ",
    en: "Web analytics - the Yandex.Metrica counter #114397545 (Yandex): for traffic statistics and interface improvements, anonymized visit data is processed - cookies, IP address, visit parameters. Yandex processes it under ",
  },
  s2bLink: { ru: "его политике", en: "its own policy" },
  s2bB: {
    ru: "; на стороне Сервиса эти данные не хранятся. Счётчик загружается только после того, как вы согласитесь на аналитику в баннере cookie: без согласия скрипт Метрики не запускается вовсе, а сам выбор хранится в localStorage вашего браузера (никакие прочие cookie на Сервисе не ставятся). Согласие можно отозвать в любой момент - блок ниже сбрасывает выбор и баннер появится снова.",
    en: "; none of it is stored on the Service side. The counter loads only after you consent to analytics in the cookie banner: without consent the Metrica script never starts, and the choice itself lives in your browser's localStorage (no other cookies are set by the Service). You can withdraw consent at any time - the block below resets the choice and the banner reappears.",
  },
  s2c: {
    ru: "Исключение - покупка платного пропуска (Launch Pass, Pro Pass, Agency Pack): адрес электронной почты плательщика обрабатывается только транзитом и передаётся платёжному провайдеру (ЮKassa; для иностранных карт Lava.top) для формирования чека и идентификации платежа. Оператор электронную почту не хранит. Запись о покупке содержит идентификатор платежа, сумму, домен пропуска, срок его действия и идентификатор диалога Telegram покупателя - только для поддержки, возвратов и проверки прав. Записи покупок хранятся 3 года - срок налоговой давности; идентификатор диалога удаляется по запросу через команду /delete в боте или письмо на контактный адрес. Оператор не публикует эти сведения и не передаёт их третьим лицам, кроме платёжных провайдеров и налоговых органов.",
    en: "The exception is a paid pass purchase (Launch Pass, Pro Pass, Agency Pack): the payer's email address is processed in transit only and handed to the payment provider (YooKassa; Lava.top for foreign cards) for the receipt and payment identification. The operator does not store the email. A purchase record holds the payment id, the amount, the pass domain, its expiry and the buyer's Telegram chat id - solely for support, refunds and entitlement checks. Purchase records are kept for 3 years, the tax retention period; the chat id is deleted on request via the /delete command in the bot or an email to the contact address. The operator does not publish this information and does not share it with third parties, except the payment providers and the tax authorities.",
  },
  s2d: {
    ru: "В localStorage браузера хранится только выбранный язык интерфейса. Эти данные не покидают ваш браузер.",
    en: "Your browser's localStorage keeps only the chosen interface language. This data never leaves your browser.",
  },
  s2eA: {
    ru: "Результаты проверки (адрес/домен ресурса, дата, оценка, перечень найденных замечаний) сохраняются в базе Сервиса и могут публиковаться в открытом реестре ",
    en: "Scan results (the resource address/domain, date, grade, list of found issues) are stored in the Service database and may be published in the open registry ",
  },
  s2eB: {
    ru: ", в том числе со ссылкой на проверенный ресурс.",
    en: ", including a link to the scanned resource.",
  },
  s2f: {
    ru: "Инфраструктурные журналы обращений (IP-адрес, время запроса) обрабатывают поставщики инфраструктуры Сервиса - Vercel Inc. и Cloudflare, Inc. - в соответствии с их собственными политиками. Сервис не распоряжается этими журналами самостоятельно.",
    en: "Infrastructure request logs (IP address, request time) are processed by the Service's infrastructure providers - Vercel Inc. and Cloudflare, Inc. - under their own policies. The Service does not control these logs itself.",
  },
  s2gA: {
    ru: "Содержимое обнаруженных в ходе скана файлов и секретов не сохраняется: данные принудительно маскируются (см. ",
    en: "The contents of files and secrets discovered during a scan are not stored: the data is force-masked (see the ",
  },
  s2gLink: { ru: "политику сканера", en: "scanner policy" },
  s2gB: { ru: ")", en: ")" },
  s2h: {
    ru: "Сервис также работает в Telegram-боте @AppSeal_Monitor_Bot. Бот хранит идентификатор вашего диалога (chat id), выбранный язык интерфейса и историю покупок и активированных пропусков - только для оказания услуги: ответов на запросы, наблюдений за доменами, алертов и поддержки. ФИО, e-mail и телефон бот не запрашивает. Все данные, связанные с вашим диалогом, удаляются командой /delete в боте.",
    en: "The Service also runs a Telegram bot, @AppSeal_Monitor_Bot. The bot stores your chat id, the chosen interface language and the history of your purchases and activated passes - solely to deliver the service: answering lookups, watching domains, alerts and support. It never asks for names, emails or phone numbers. All data tied to your chat is removed by the /delete command in the bot.",
  },
  s2i: {
    ru: "Записи проверок и покупок хранятся в базе данных Сервиса, размещённой у провайдера Supabase (центр обработки данных в ЕС, Германия); горячий кеш проверок - у Upstash. IP-адрес на стороне Сервиса обрабатывается только в виде соль-хеша - исключительно для лимита частоты запросов и защиты от спама; восстановить исходный адрес из этого значения невозможно.",
    en: "Scan and purchase records live in the Service database hosted by Supabase (a data center in the EU, Germany); the hot scan cache is kept at Upstash. On the Service side, IP addresses are processed only as salted hashes - solely for rate limits and spam protection; the original address cannot be recovered from the hash.",
  },
  s3Title: { ru: "3. Публичный реестр и удаление записей", en: "3. Public registry and record removal" },
  s3aA: {
    ru: "Владелец ресурса вправе запросить исключение его записи из публичного реестра - направьте письмо на ",
    en: "A resource owner may request the removal of their record from the public registry - email ",
  },
  s3aB: {
    ru: " с указанием домена. Запрос обрабатывается в течение 3 рабочих дней.",
    en: " with the domain name. Requests are processed within 3 business days.",
  },
  s3bA: {
    ru: "Чтобы полностью запретить сканирование своего ресурса, добавьте в robots.txt директиву ",
    en: "To fully disallow scanning of your site, add the directive ",
  },
  s3bB: {
    ru: " - сканер прекращает проверку с уведомлением пользователя.",
    en: " to your robots.txt - the scanner stops the check and tells the user it was disallowed.",
  },
  s4Title: { ru: "4. Отказ от ответственности", en: "4. Disclaimer" },
  s4a: {
    ru: "Результаты проверки носят исключительно информационный характер, формируются автоматизированной эвристикой и ",
    en: "Scan results are informational only, produced by automated heuristics, and ",
  },
  s4aStrong: { ru: "не являются", en: "are not" },
  s4aB: {
    ru: " заключением аудита безопасности, гарантией отсутствия уязвимостей или подтверждением соответствия требованиям регуляторов.",
    en: " a security audit, a guarantee of vulnerability-free operation, or proof of compliance with any regulator's requirements.",
  },
  s4b: {
    ru: "Сервис предоставляется «как есть», без каких-либо гарантий. Оператор не несёт ответственности за решения, принятые на основе результатов проверки, и за прямой или косвенный ущерб, связанный с использованием Сервиса.",
    en: "The Service is provided \"as is\", without any warranty. The operator is not liable for decisions made based on scan results or for any direct or indirect damage related to the use of the Service.",
  },
  s4c: {
    ru: "Условия использования бесплатных функций Сервиса не являются публичной офертой; условия приобретения платных пропусков (Launch Pass, Pro Pass, Agency Pack) закреплены в разделе 5 ниже (публичная оферта). К отношениям по использованию Сервиса применяется законодательство Российской Федерации.",
    en: "The terms of the Service's free features do not constitute a public offer; the terms of the paid passes (Launch Pass, Pro Pass, Agency Pack) are set out in section 5 below (a public offer). Russian law governs the use of the Service.",
  },
  s5Title: { ru: "5. Условия приобретения пропусков (публичная оферта)", en: "5. Pass purchase terms (public offer)" },
  s5a: {
    ru: "Акцепт настоящего раздела - оплата, оформленная в Telegram-боте Сервиса (@AppSeal_Monitor_Bot) по ссылке с сайта. Оплата означает полное и безоговорочное принятие условий этого раздела.",
    en: "Acceptance of this section is a payment made in the Service's Telegram bot (@AppSeal_Monitor_Bot) via the link from the site. Payment means full and unconditional acceptance of this section's terms.",
  },
  s5bA: {
    ru: "Предмет: разовый цифровой пропуск (Launch Pass) на один указанный покупателем домен. Цена - ",
    en: "Subject: a one-time digital pass (Launch Pass) for one domain specified by the buyer. The price is ",
  },
  s5bPrice: { ru: "490 ₽", en: "490 RUB ($6)" },
  s5bB: {
    ru: ", разовый платёж, автоматических списаний и автопродления нет.",
    en: ", a one-time payment, with no automatic charges or renewal.",
  },
  s5cA: {
    ru: "Пропуск действует ",
    en: "The pass is valid for ",
  },
  s5cDays: { ru: "7 суток", en: "7 days" },
  s5cB: {
    ru: " с момента оплаты и открывает на этот домен: неограниченное число повторных сканов, скачиваемый PDF-отчёт и встраиваемый бейдж доверия для сайта. Fix-prompt остаётся бесплатным.",
    en: " from the moment of payment and unlocks for that domain: unlimited rescans, a downloadable PDF report and an embeddable trust badge for the site. The fix prompt stays free.",
  },
  s5dA: {
    ru: "Agency Pack - оптовый вариант того же продукта: ",
    en: "Agency Pack - the wholesale variant of the same product: ",
  },
  s5dPrice: { ru: "1 490 ₽", en: "1,490 RUB ($19)" },
  s5dB: {
    ru: " за 5 пропусков (каждый - на отдельный домен, 7 суток с момента его активации). После оплаты покупатель активирует пропуска командой /redeem в Telegram-боте; кредиты пакета действуют 30 суток с момента оплаты. Автопродления нет: пакет не восполняется автоматически.",
    en: " for 5 passes (each for a separate domain, 7 days from its activation). After payment the buyer activates the passes with the /redeem command in the Telegram bot; pack credits live 30 days from the moment of payment. No auto-renewal: the pack is not refilled automatically.",
  },
  s5pA: {
    ru: "Pro Pass - тот же продукт на длинный срок: ",
    en: "Pro Pass - the same product with a longer term: ",
  },
  s5pPrice: { ru: "1 490 ₽", en: "1,490 RUB ($19)" },
  s5pB: {
    ru: " за 30 суток безлимита сканов одного домена (Launch Pass действует 7 суток). Состав функций тот же: неограниченные повторные сканы, фоновый перескан каждые 6 ч с алертом при падении класса, PDF-отчёт и встраиваемый бейдж доверия. Разовый платёж, автопродления нет.",
    en: " for 30 days of unlimited scans of one domain (Launch Pass covers 7). The feature set is the same: unlimited rescans, a background re-check every 6 hours with a grade-drop alert, the PDF report and the embeddable trust badge. One-time payment, no auto-renewal.",
  },
  s5e: {
    ru: "Оплата проходит через платёжных провайдеров, подключённых в Telegram-боте (эквайринг ЮKassa; для иностранных карт - Lava.top). Чек самозанятого (НПД) направляется плательщику в Telegram. Оператор - самозанятый гражданин РФ; контакт для всех вопросов: ",
    en: "Payment goes through the payment providers connected in the Telegram bot (YooKassa acquiring; Lava.top for foreign cards). The self-employed tax receipt is sent to the payer in Telegram. The operator is a self-employed Russian citizen; contact for all questions: ",
  },
  s5fA: {
    ru: "Доступ к функциям пропуска активируется автоматически сразу после подтверждения платежа. Если пропуск не активировался или не работает в течение срока действия, покупатель направляет письмо на ",
    en: "Pass features activate automatically right after the payment is confirmed. If the pass fails to activate or stops working during its term, the buyer emails ",
  },
  s5fB: {
    ru: " с указанием домена и даты оплаты - платёж возвращается полностью в течение 3 рабочих дней. По остальным основаниям возвраты не предусмотрены (цифровой товар, оказан и использован мгновенно).",
    en: " with the domain and payment date - a full refund is issued within 3 business days. No other refunds are provided (a digital product, delivered and consumed instantly).",
  },
  s6Title: { ru: "6. Возвраты", en: "6. Refunds" },
  s6aA: {
    ru: "Разовые покупки платных пропусков (Launch Pass, Pro Pass, Agency Pack) не подлежат возврату после активации, потому что продукт моментально открывает полный доступ к функциям на купленный период. Если оплата прошла, а доступ не активировался - напишите на ",
    en: "One-time purchases of the paid passes (Launch Pass, Pro Pass, Agency Pack) are non-refundable once activated, since the pass instantly unlocks full features for the paid period. If payment succeeded but the pass did not activate, email ",
  },
  s6aB: {
    ru: ", активируем вручную или вернём платёж в течение 3 рабочих дней.",
    en: " - we will activate it manually or refund within 3 business days.",
  },
  s7Title: { ru: "7. Отзывы пользователей", en: "7. User reviews" },
  s7a: {
    ru: "На витрине отзывов (/reviews) любой посетитель может оставить отзыв: никнейм, оценку 1-5, текст и (необязательно) домен проверенного приложения. Отправляя отзыв, вы подтверждаете согласие на публикацию указанных никнейма, оценки и текста - без этого подтверждения отзыв не отправляется.",
    en: "On the review page (/reviews) any visitor may leave a review: a nickname, a 1-5 rating, a text and (optionally) the domain of the scanned app. By submitting a review you confirm consent to publish the nickname, rating and text you entered - without that confirmation the review is not sent.",
  },
  s7b: {
    ru: "Каждый отзыв проходит ручную премодерацию до публикации: реклама, ссылки и оскорбления не публикуются. Отзывы - это личные мнения их авторов, а не заявления Сервиса.",
    en: "Every review passes manual pre-moderation before publication: ads, links and insults are not published. Reviews are the personal opinions of their authors, not statements made by the Service.",
  },
  s7cA: {
    ru: "Публикуемый отзыв содержит только никнейм, оценку, текст и (по желанию автора) домен - никаких контактных данных. Отзыв можно удалить: напишите на ",
    en: "A published review contains only the nickname, the rating, the text and (optionally) the domain - no contact details. A review can be removed: email ",
  },
  s7cB: {
    ru: " с указанием никнейма и текста отзыва - обработаем в течение 3 рабочих дней.",
    en: " with the nickname and the review text - it will be handled within 3 business days.",
  },
  fHome: { ru: "главная", en: "home" },
  fRegistry: { ru: "реестр", en: "registry" },
  fBot: { ru: "робот", en: "bot" },
} as const;

export default async function LegalPage() {
  const lang: Lang = await pageLang();
  const t = (k: keyof typeof D) => D[k][lang];

  return (
    <div className="relative flex min-h-screen flex-col text-slate-100">
      <Ambient />
      <SiteHeader lang={lang} />

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="appseal-card appseal-skin rounded-2xl p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">{t("eyebrow")}</p>
              <h1 className="font-display text-2xl font-extrabold text-slate-50 sm:text-3xl">{t("h1")}</h1>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            {t("introA")}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <div className="mt-4 rounded-xl border border-slate-800 bg-[#090d16] p-4 text-[13px] leading-relaxed text-slate-300">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">{t("operatorEyebrow")}</p>
            <p className="mt-2">{t("operatorWho")}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">
              {lang === "en" ? "TIN" : "ИНН"}: 026906141678 · e-mail: {CONTACT_EMAIL}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("operatorRequisites")}</p>
          </div>

          <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-300">
            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-sky-400" />
                {t("s1Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>{t("s1a")}</li>
                <li>
                  {t("s1bA")}
                  <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">GET</code>/
                  <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">HEAD</code>/
                  <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">OPTIONS</code>
                  {t("s1bB")}
                </li>
                <li>{t("s1c")}</li>
                <li>{t("s1d")}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Lock className="h-4 w-4 text-sky-400" />
                {t("s2Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>{t("s2a")}</li>
                <li>
                  {t("s2bA")}
                  <a
                    href="https://yandex.ru/legal/confidential/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300"
                  >
                    {t("s2bLink")}
                  </a>
                  {t("s2bB")}
                </li>
                <CookiePrefs />
                <li>{t("s2c")}</li>
                <li>{t("s2d")}</li>
                <li>{t("s2h")}</li>
                <li>
                  {t("s2eA")}
                  <Link href="/registry" className="text-sky-400 hover:text-sky-300">/registry</Link>
                  {t("s2eB")}
                </li>
                <li>{t("s2i")}</li>
                <li>{t("s2f")}</li>
                <li>
                  {t("s2gA")}
                  <Link href="/bot" className="text-sky-400 hover:text-sky-300">{t("s2gLink")}</Link>
                  {t("s2gB")}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Globe className="h-4 w-4 text-sky-400" />
                {t("s3Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  {t("s3aA")}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  {t("s3aB")}
                </li>
                <li>
                  {t("s3bA")}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
                    User-agent: AppSeal-Scanner · Disallow: /
                  </code>
                  {t("s3bB")}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                {t("s4Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  {t("s4a")}
                  <strong className="text-slate-100">{t("s4aStrong")}</strong>
                  {t("s4aB")}
                </li>
                <li>{t("s4b")}</li>
                <li>{t("s4c")}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-emerald-400" />
                {t("s5Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>{t("s5a")}</li>
                <li>
                  {t("s5bA")}
                  <strong className="text-slate-100">{t("s5bPrice")}</strong>
                  {t("s5bB")}
                </li>
                <li>
                  {t("s5cA")}
                  <strong className="text-slate-100">{t("s5cDays")}</strong>
                  {t("s5cB")}
                </li>
                <li>
                  {t("s5dA")}
                  <strong className="text-slate-100">{t("s5dPrice")}</strong>
                  {t("s5dB")}
                </li>
                <li>
                  {t("s5pA")}
                  <strong className="text-slate-100">{t("s5pPrice")}</strong>
                  {t("s5pB")}
                </li>
                <li>
                  {t("s5e")}
                  {CONTACT_EMAIL}.
                </li>
                <li>
                  {t("s5fA")}
                  {CONTACT_EMAIL}
                  {t("s5fB")}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-sky-400" />
                {t("s6Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>
                  {t("s6aA")}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  {t("s6aB")}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-sky-400" />
                {t("s7Title")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 pl-1">
                <li>{t("s7a")}</li>
                <li>{t("s7b")}</li>
                <li>
                  {t("s7cA")}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  {t("s7cB")}
                </li>
              </ul>
            </section>

            {lang === "ru" ? (
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
                    passive: public GET/HEAD/OPTIONS responses, plus a headless-browser render of
                    client-side (SPA) pages - no login attempts, form submissions or load testing.
                  </li>
                  <li>
                    Launch Pass: 490 RUB one-time purchase in the Service&apos;s Telegram bot, valid 7
                    days per domain, unlocks unlimited rescans, the PDF report and the embeddable
                    badge - no auto-renewal. If the pass fails to activate, a full refund is issued
                    within 3 business days (email the contact above). Once activated, the pass is
                    non-refundable.
                  </li>
                  <li>
                    Pro Pass: 1,490 RUB ($19) one-time purchase, valid 30 days per domain - the same
                    feature set as Launch Pass with a longer term. Agency Pack: 1,490 RUB ($19) for 5
                    Launch Passes (activated one by one with /redeem, credits live 30 days). The
                    refund rule above applies to every paid pass.
                  </li>
                  <li>
                    No accounts, no forms. Web analytics: the Yandex.Metrica counter #114397545
                    (Yandex) processes anonymized visit data (cookies, IP address, visit
                    parameters) for traffic statistics under{" "}
                    <a
                      href="https://yandex.ru/legal/confidential/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300"
                    >
                      Yandex&apos;s own policy
                    </a>
                    ; none of it is stored on our side (exception: the buyer&apos;s email
                    during a Launch Pass purchase is processed in transit and handed to the payment
                    provider YooKassa for the receipt - the operator does not store it; purchase
                    records hold the payment id, the pass domain, its expiry and the buyer&apos;s
                    Telegram chat id, kept for the 3-year tax retention period, chat id removable on
                    request). The counter loads only
                    after you opt in via the cookie banner; your choice lives in your browser&apos;s
                    localStorage and can be reset in the cookie preferences block above. Only the
                    chosen UI language is kept in your browser. The Service also runs a Telegram bot:
                    it stores the chat id, the chosen language and the purchase/pass history solely
                    to deliver the service - the /delete command in the bot removes all chat-tied
                    data. Durable records live in a Supabase database in the EU (Germany); on the
                    Service side, IP addresses are processed only as salted hashes for rate limits.
                    Scan results (domain, date, grade) may be
                    published in the public registry; domain owners may request removal by email
                    (processed within 3 business days). User reviews (nickname, rating, text) go
                    public only after manual moderation - submitting one confirms consent to publish
                    the nickname. Request logs are handled by infrastructure
                    providers Vercel and Cloudflare under their own policies.
                  </li>
                  <li>
                    Results are automated heuristic findings - not a security audit, not a guarantee,
                    provided &quot;as is&quot;. Russian law applies.
                  </li>
                </ul>
              </section>
            ) : null}
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
              <Link href="/" className="transition hover:text-slate-500">{t("fHome")}</Link> · <Link href="/registry" className="transition hover:text-slate-500">{t("fRegistry")}</Link> · <Link href="/bot" className="transition hover:text-slate-500">{t("fBot")}</Link>
            </p>
          </div>
          <div className="shrink-0 transition-transform hover:scale-[1.02]">
            <a
              href="/verified/appseal.online"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified - live grade"
              className="inline-block"
            >
              <img
                src="/api/badge?host=appseal.online"
                alt="AppSeal Verified"
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
