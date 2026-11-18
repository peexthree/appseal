import { NextRequest, NextResponse } from "next/server";
import { createPayment, getPayment, ykConfig, type YkPayment } from "@/lib/yookassa";
import { createLavaInvoice, getLavaInvoice, lavaConfig } from "@/lib/lava";
import {
  activatePass,
  daysForKind,
  ensurePackGranted,
  getLavaInvoiceHost,
  getNonceFinal,
  getPackCredits,
  getPassByPayment,
  getPaymentIdByNonce,
  hashIp,
  proHostFromLavaMarker,
  PRO_PASS_DAYS,
  redisCommand,
  setChatPack,
  setLavaInvoiceHost,
  setNonceFinal,
  setNonceMapping,
} from "@/lib/passes";
import { getClientIp } from "@/lib/sec";
import { sendTelegramAlert } from "@/lib/telegram";
import type { Lang } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_PRICE_RUB = "490.00";
const PACK_PRICE_RUB = "1490.00";
// Pro Pass: 30 days of unlimited scans on one domain, one-time purchase
const PRO_PRICE_RUB = "1490.00";
// the USD pack goes through a separate Lava offer (LAVA_PACK_OFFER_ID);
// until it is configured the card path sells single passes only
const PACK_PRICE_USD_OFFER = process.env.LAVA_PACK_OFFER_ID ?? "";
// the $19 Pro offer is the same idea: a distinct Lava offer id per product
const PRO_PRICE_USD_OFFER = process.env.LAVA_PRO_OFFER_ID ?? "";
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const CHAT_RE = /^[A-Za-z0-9_-]{3,64}$/;
// return URL is pinned to our own origin - YooKassa sends the payer back here
const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";
// POST rate limit: 10 checkout starts per hour per IP (the GET return-page
// poll is exempt - it is the buyer's own status refresh)
const PURCHASE_RATE_LIMIT = 10;
const PURCHASE_RATE_WINDOW_S = 3600;

export async function POST(req: NextRequest) {
  try {
    // per-IP POST rate limit over the same Upstash REST mechanism as the pass
    // store: SET NX wins once per window and pins the TTL atomically, INCR
    // counts the rest (an expire can no longer be lost between two commands).
    // Redis absent/hiccuping -> the counter fails open, the purchase flow works.
    const ip = getClientIp(req.headers);
    const rlKey = `rl:purchase:${hashIp(ip)}`;
    const fresh = await redisCommand<string>([
      "SET", rlKey, "1", "EX", String(PURCHASE_RATE_WINDOW_S), "NX",
    ]);
    let hits = 1;
    if (fresh !== "OK") {
      hits = (await redisCommand<number>(["INCR", rlKey])) ?? 1;
    }
    if (hits > PURCHASE_RATE_LIMIT) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const body = (await req.json()) as {
      host?: string;
      email?: string;
      nonce?: string;
      lang?: Lang;
      provider?: string;
      kind?: string;
      chatId?: string;
      plan?: string;
    };
    const email = (body.email ?? "").trim();
    const nonce = (body.nonce ?? "").trim();
    // the bot sends plan: "pro" for the 30-day pass; "lpro" in kind is the
    // same variant spelled the way the payment payload carries it
    const kind =
      body.kind === "lpack" ? "lpack" : body.plan === "pro" || body.kind === "lpro" ? "lpro" : "lpass";
    const chatId = (body.chatId ?? "").trim();
    // ru buyers pay in RUB via YooKassa; the EN storefront pays $6 in USD via
    // Lava.top (foreign Visa/MC) - provider is chosen by the client locale
    const provider = body.provider === "lava" ? "lava" : "yk";

    // Agency Pack: no target domain yet - the 5 credits are redeemed later
    const host = kind === "lpack"
      ? ""
      : (body.host ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
    if (kind === "lpass" && !HOST_RE.test(host)) {
      return NextResponse.json({ error: "invalid host" }, { status: 400 });
    }
    if (kind === "lpack" && chatId && !CHAT_RE.test(chatId)) {
      return NextResponse.json({ error: "invalid chat" }, { status: 400 });
    }
    // 422-FZ art.14: the self-employed receipt must reach the buyer - the email
    // transits to the payment provider and is never stored by us (152-FZ)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }
    if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) {
      return NextResponse.json({ error: "invalid nonce" }, { status: 400 });
    }

    // 🔔 Notify owner: someone started a purchase
    const kindLabel =
      kind === "lpack" ? "Agency Pack (5 кредитов)" :
      kind === "lpro"  ? `Pro Pass 30д — ${host}` :
                         `Launch Pass 7д — ${host}`;
    const providerLabel = provider === "lava" ? "Lava (USD)" : "ЮКасса (RUB)";
    void sendTelegramAlert(
      `💳 Попытка покупки!\n` +
      `📦 Тариф: ${kindLabel}\n` +
      `💰 Провайдер: ${providerLabel}\n` +
      `📧 Email: ${email}\n` +
      `🕐 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}\n` +
      (ip !== "unknown" ? `📡 IP: ${ip}` : "")
    );

    if (provider === "lava") {
      const lava = lavaConfig();
      if (!lava) {
        return NextResponse.json({ error: "global payments unavailable" }, { status: 503 });
      }
      if (kind === "lpack") {
        if (!PACK_PRICE_USD_OFFER) {
          return NextResponse.json({ error: "pack unavailable via card" }, { status: 503 });
        }
        const invoice = await createLavaInvoice(lava, { email, nonce, offerId: PACK_PRICE_USD_OFFER });
        await setNonceMapping(nonce, `lava:${invoice.invoiceId}`);
        // the pack marker rides in the invoice->host map: the webhook and the
        // return page branch on it exactly like on the YooKassa metadata kind
        await setLavaInvoiceHost(invoice.invoiceId, chatId ? `pack:${chatId}` : "pack");
        return NextResponse.json({ confirmationUrl: invoice.url });
      }
      if (kind === "lpro") {
        if (!PRO_PRICE_USD_OFFER) {
          return NextResponse.json({ error: "pro unavailable via card" }, { status: 503 });
        }
        const invoice = await createLavaInvoice(lava, { email, nonce, offerId: PRO_PRICE_USD_OFFER });
        await setNonceMapping(nonce, `lava:${invoice.invoiceId}`);
        // the Pro marker rides in the invoice->host map like the pack one:
        // both activation paths branch on it and add 30 days
        await setLavaInvoiceHost(invoice.invoiceId, `pro:${host}`);
        return NextResponse.json({ confirmationUrl: invoice.url });
      }
      const invoice = await createLavaInvoice(lava, { email, nonce });
      // the nonce is the only browser-held reference; the invoice->host map
      // feeds both the webhook and the return-page activation
      await setNonceMapping(nonce, `lava:${invoice.invoiceId}`);
      await setLavaInvoiceHost(invoice.invoiceId, host);
      return NextResponse.json({ confirmationUrl: invoice.url });
    }

    const cfg = ykConfig();
    if (!cfg) {
      return NextResponse.json({ error: "payments unavailable" }, { status: 503 });
    }
    const payment = await createPayment({
      amountRub: kind === "lpack" ? PACK_PRICE_RUB : kind === "lpro" ? PRO_PRICE_RUB : PASS_PRICE_RUB,
      description:
        kind === "lpack"
          ? "AppSeal Agency Pack - 5 пропусков по 7 дней"
          : kind === "lpro"
            ? `AppSeal Pro Pass - 30 дней безлимитных проверок ${host}`
            : `AppSeal Launch Pass - неделя безлимитных проверок ${host}`,
      returnUrl: `${SITE_ORIGIN}/?paid=${encodeURIComponent(nonce)}`,
      metadata: kind === "lpack" ? { kind: "lpack", nonce, chatId } : { kind, host, nonce },
      receiptEmail: email,
    });
    const url = payment.confirmation?.confirmation_url;
    if (!url) {
      return NextResponse.json({ error: "no confirmation url" }, { status: 502 });
    }
    // the nonce is the only browser-held reference to this payment
    await setNonceMapping(nonce, `yk:${payment.id}`);
    return NextResponse.json({ confirmationUrl: url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "purchase failed" },
      { status: 502 },
    );
  }
}

/** Poll from the return page: /?paid=<nonce> -> GET /api/purchase?nonce=.
 *  Nonce values are prefixed at creation: "yk:<paymentId>" (legacy values have
 *  no prefix and are YooKassa) or "lava:<invoiceId>". A successfully resolved
 *  nonce is cached under a 1-hour final key, so replays never re-run the
 *  activation chain or re-fetch the provider API. */
export async function GET(req: NextRequest) {
  const nonce = req.nextUrl.searchParams.get("nonce") ?? "";
  if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) {
    return NextResponse.json({ error: "invalid nonce" }, { status: 400 });
  }
  const final = await getNonceFinal(nonce);
  if (final) {
    return NextResponse.json(final);
  }
  const raw = await getPaymentIdByNonce(nonce);
  if (!raw) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }

  if (raw.startsWith("lava:")) {
    const lava = lavaConfig();
    if (!lava) {
      return NextResponse.json({ error: "global payments unavailable" }, { status: 503 });
    }
    const invoiceId = raw.slice(5);
    // a provider hiccup (timeout, network) must not 500 the buyer's return
    // page - answer "status pending" instead, the nonce can be re-polled
    let invoice: Awaited<ReturnType<typeof getLavaInvoice>>;
    try {
      invoice = await getLavaInvoice(lava, invoiceId);
    } catch {
      return NextResponse.json({ error: "status_check_failed" }, { status: 200 });
    }
    if (!invoice) {
      return NextResponse.json({ error: "payment not found" }, { status: 404 });
    }
    if (!invoice.paid) {
      return NextResponse.json({ status: invoice.status });
    }
    const host = (await getLavaInvoiceHost(invoiceId)) ?? "";
    // Agency Pack invoice: the marker rides in the host field ("pack:<chatId>")
    if (host.startsWith("pack")) {
      const granted = await ensurePackGranted(invoiceId);
      if (granted) {
        const chatId = host.slice(5);
        if (chatId) await setChatPack(chatId, invoiceId);
      }
      const result = { status: "succeeded" as const, pack: true, credits: await getPackCredits(invoiceId) };
      await setNonceFinal(nonce, result);
      return NextResponse.json(result);
    }
    // Pro Pass invoice: "pro:<host>" marker -> 30 days on the plain host
    const proHost = proHostFromLavaMarker(host);
    const passHost = proHost ?? host;
    const existing = await getPassByPayment(invoiceId);
    const pass = existing ?? (await activatePass(invoiceId, passHost, proHost ? PRO_PASS_DAYS : undefined));
    const result = pass.host
      ? { status: "succeeded" as const, host: pass.host, until: pass.until }
      : { status: "succeeded" as const, host: "", until: "" };
    await setNonceFinal(nonce, result);
    return NextResponse.json(result);
  }

  const paymentId = raw.startsWith("yk:") ? raw.slice(3) : raw;
  // same rule as the lava branch: a timeout/network failure answers "status
  // pending" (HTTP-level failures still mean a genuinely missing payment)
  let payment: YkPayment | null;
  try {
    payment = await getPayment(paymentId);
  } catch {
    return NextResponse.json({ error: "status_check_failed" }, { status: 200 });
  }
  if (!payment) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }
  if (payment.status !== "succeeded") {
    return NextResponse.json({ status: payment.status });
  }
  const meta = payment.metadata ?? {};
  // Agency Pack: grant the credits instead of activating a host pass
  if (meta.kind === "lpack") {
    const granted = await ensurePackGranted(payment.id);
    if (granted && meta.chatId) {
      await setChatPack(meta.chatId, payment.id);
    }
    const result = { status: "succeeded" as const, pack: true, credits: await getPackCredits(payment.id) };
    await setNonceFinal(nonce, result);
    return NextResponse.json(result);
  }
  // idempotent: reuse the stored pass if the webhook already activated it.
  // The payer email stays with YooKassa (receipt); we store no personal data.
  // kind "lpro" in the metadata extends the pass to the 30-day Pro term.
  const existing = await getPassByPayment(payment.id);
  const pass = existing ?? (await activatePass(payment.id, meta.host ?? "", daysForKind(meta.kind)));
  const result = pass.host
    ? { status: "succeeded" as const, host: pass.host, until: pass.until }
    : { status: "succeeded" as const, host: "", until: "" };
  await setNonceFinal(nonce, result);
  return NextResponse.json(result);
}
