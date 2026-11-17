import { NextRequest, NextResponse } from "next/server";
import { createPayment, getPayment, ykConfig } from "@/lib/yookassa";
import { createLavaInvoice, getLavaInvoice, lavaConfig } from "@/lib/lava";
import {
  activatePass,
  ensurePackGranted,
  getLavaInvoiceHost,
  getNonceFinal,
  getPackCredits,
  getPassByPayment,
  getPaymentIdByNonce,
  setChatPack,
  setLavaInvoiceHost,
  setNonceFinal,
  setNonceMapping,
} from "@/lib/passes";
import type { Lang } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_PRICE_RUB = "490.00";
const PACK_PRICE_RUB = "1490.00";
// the USD pack goes through a separate Lava offer (LAVA_PACK_OFFER_ID);
// until it is configured the card path sells single passes only
const PACK_PRICE_USD_OFFER = process.env.LAVA_PACK_OFFER_ID ?? "";
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const CHAT_RE = /^[A-Za-z0-9_-]{3,64}$/;
// return URL is pinned to our own origin - YooKassa sends the payer back here
const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      host?: string;
      email?: string;
      nonce?: string;
      lang?: Lang;
      provider?: string;
      kind?: string;
      chatId?: string;
    };
    const email = (body.email ?? "").trim();
    const nonce = (body.nonce ?? "").trim();
    const kind = body.kind === "lpack" ? "lpack" : "lpass";
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
      amountRub: kind === "lpack" ? PACK_PRICE_RUB : PASS_PRICE_RUB,
      description:
        kind === "lpack"
          ? "AppSeal Agency Pack - 5 пропусков по 7 дней"
          : `AppSeal Launch Pass - неделя безлимитных проверок ${host}`,
      returnUrl: `${SITE_ORIGIN}/?paid=${encodeURIComponent(nonce)}`,
      metadata: kind === "lpack" ? { kind: "lpack", nonce, chatId } : { kind: "lpass", host, nonce },
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
    const invoice = await getLavaInvoice(lava, invoiceId);
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
    const existing = await getPassByPayment(invoiceId);
    const pass = existing ?? (await activatePass(invoiceId, host));
    const result = pass.host
      ? { status: "succeeded" as const, host: pass.host, until: pass.until }
      : { status: "succeeded" as const, host: "", until: "" };
    await setNonceFinal(nonce, result);
    return NextResponse.json(result);
  }

  const paymentId = raw.startsWith("yk:") ? raw.slice(3) : raw;
  const payment = await getPayment(paymentId);
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
  const existing = await getPassByPayment(payment.id);
  const pass = existing ?? (await activatePass(payment.id, meta.host ?? ""));
  const result = pass.host
    ? { status: "succeeded" as const, host: pass.host, until: pass.until }
    : { status: "succeeded" as const, host: "", until: "" };
  await setNonceFinal(nonce, result);
  return NextResponse.json(result);
}
