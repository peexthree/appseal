import { NextRequest, NextResponse } from "next/server";
import { createPayment, getPayment, ykConfig } from "@/lib/yookassa";
import { activatePass, getPassByPayment, getPaymentIdByNonce, setNonceMapping } from "@/lib/passes";
import type { Lang } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_PRICE_RUB = "490.00";
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// return URL is pinned to our own origin - YooKassa sends the payer back here
const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";

export async function POST(req: NextRequest) {
  const cfg = ykConfig();
  if (!cfg) {
    return NextResponse.json({ error: "payments unavailable" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as { host?: string; email?: string; nonce?: string; lang?: Lang };
    const host = (body.host ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
    const email = (body.email ?? "").trim();
    const nonce = (body.nonce ?? "").trim();
    if (!HOST_RE.test(host)) {
      return NextResponse.json({ error: "invalid host" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }
    if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) {
      return NextResponse.json({ error: "invalid nonce" }, { status: 400 });
    }

    const payment = await createPayment({
      amountRub: PASS_PRICE_RUB,
      description: `AppSeal Launch Pass - неделя безлимитных проверок ${host}`,
      returnUrl: `${SITE_ORIGIN}/?paid=${encodeURIComponent(nonce)}`,
      metadata: { kind: "lpass", host, email, nonce },
      receiptEmail: email,
    });
    const url = payment.confirmation?.confirmation_url;
    if (!url) {
      return NextResponse.json({ error: "no confirmation url" }, { status: 502 });
    }
    // the nonce is the only browser-held reference to this payment
    await setNonceMapping(nonce, payment.id);
    return NextResponse.json({ confirmationUrl: url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "purchase failed" },
      { status: 502 },
    );
  }
}

/** Poll from the return page: /?paid=<nonce> -> GET /api/purchase?nonce= */
export async function GET(req: NextRequest) {
  const nonce = req.nextUrl.searchParams.get("nonce") ?? "";
  if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) {
    return NextResponse.json({ error: "invalid nonce" }, { status: 400 });
  }
  const paymentId = await getPaymentIdByNonce(nonce);
  if (!paymentId) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }
  const payment = await getPayment(paymentId);
  if (!payment) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }
  if (payment.status !== "succeeded") {
    return NextResponse.json({ status: payment.status });
  }
  const meta = payment.metadata ?? {};
  // idempotent: reuse the stored pass if the webhook already activated it
  const existing = await getPassByPayment(payment.id);
  const pass = existing ?? (await activatePass(payment.id, meta.host ?? "", meta.email ?? ""));
  if (!pass.host || !pass.email) {
    return NextResponse.json({ status: "succeeded", host: "", until: "" });
  }
  return NextResponse.json({ status: "succeeded", host: pass.host, until: pass.until });
}
