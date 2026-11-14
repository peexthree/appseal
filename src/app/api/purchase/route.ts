import { NextRequest, NextResponse } from "next/server";
import { createPayment, getPayment, ykConfig } from "@/lib/yookassa";
import { createLavaInvoice, getLavaInvoice, lavaConfig } from "@/lib/lava";
import {
  activatePass,
  getPassByPayment,
  getPaymentIdByNonce,
  getLavaInvoiceHost,
  setLavaInvoiceHost,
  setNonceMapping,
} from "@/lib/passes";
import type { Lang } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_PRICE_RUB = "490.00";
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
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
    };
    const host = (body.host ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
    const email = (body.email ?? "").trim();
    const nonce = (body.nonce ?? "").trim();
    // ru buyers pay in RUB via YooKassa; the EN storefront pays $6 in USD via
    // Lava.top (foreign Visa/MC) - provider is chosen by the client locale
    const provider = body.provider === "lava" ? "lava" : "yk";
    if (!HOST_RE.test(host)) {
      return NextResponse.json({ error: "invalid host" }, { status: 400 });
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
      amountRub: PASS_PRICE_RUB,
      description: `AppSeal Launch Pass - неделя безлимитных проверок ${host}`,
      returnUrl: `${SITE_ORIGIN}/?paid=${encodeURIComponent(nonce)}`,
      metadata: { kind: "lpass", host, nonce },
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
 *  no prefix and are YooKassa) or "lava:<invoiceId>". */
export async function GET(req: NextRequest) {
  const nonce = req.nextUrl.searchParams.get("nonce") ?? "";
  if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) {
    return NextResponse.json({ error: "invalid nonce" }, { status: 400 });
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
    const existing = await getPassByPayment(invoiceId);
    const pass = existing ?? (await activatePass(invoiceId, host));
    if (!pass.host) {
      return NextResponse.json({ status: "succeeded", host: "", until: "" });
    }
    return NextResponse.json({ status: "succeeded", host: pass.host, until: pass.until });
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
  // idempotent: reuse the stored pass if the webhook already activated it.
  // The payer email stays with YooKassa (receipt); we store no personal data.
  const existing = await getPassByPayment(payment.id);
  const pass = existing ?? (await activatePass(payment.id, meta.host ?? ""));
  if (!pass.host) {
    return NextResponse.json({ status: "succeeded", host: "", until: "" });
  }
  return NextResponse.json({ status: "succeeded", host: pass.host, until: pass.until });
}
