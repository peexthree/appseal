import { NextRequest, NextResponse } from "next/server";
import {
  activatePass,
  ensurePackGranted,
  getLavaInvoiceHost,
  PRO_PASS_DAYS,
  proHostFromLavaMarker,
  setChatPack,
} from "@/lib/passes";
import { ledgerPurchase } from "@/lib/db/index";
import { secretsMatch } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lava.top webhook (configured in the dashboard: Integrations -> API ->
 * Add Webhook). Lava authenticates by echoing our API key in X-Api-Key;
 * when LAVATOP_WEBHOOK_SECRET is set the dashboard can send it instead -
 * the API key then never doubles as a webhook secret (least privilege).
 * Both variants are accepted during the migration; comparisons are
 * constant-time. payment.success activates the Launch Pass for the host
 * bound at invoice creation; every other event type is acknowledged - the
 * docs require a 2xx within 10 seconds for unknown events too.
 */
export async function POST(req: NextRequest) {
  const key = (req.headers.get("x-api-key") ?? "").trim();
  const webhookSecret = (process.env.LAVATOP_WEBHOOK_SECRET ?? "").trim();
  const apiKey = (process.env.LAVATOP_API ?? "").trim();
  if (
    !secretsMatch(key, webhookSecret) &&
    !secretsMatch(key, apiKey)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true });
  }
  // payment.* events use a flat camelCase structure; refund/chargeback use an
  // event_type envelope - both are answered ok, only payment.success acts
  const eventType = String(body.eventType ?? body.event_type ?? "");
  if (eventType !== "payment.success") {
    return NextResponse.json({ ok: true });
  }
  // find the invoice reference among plausible flat fields
  const candidates = [body.invoiceId, body.invoice_id, body.id, body.contractId];
  const invoiceId = candidates.find(
    (v) => typeof v === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(v),
  ) as string | undefined;
  if (!invoiceId) {
    return NextResponse.json({ ok: true });
  }
  // ledger amount is optional: parse defensively, any odd shape stays null
  // (the invoice-creation path already recorded currency USD + "pending")
  const rawAmount = body.amount ?? body.sum;
  const parsedAmount = typeof rawAmount === "string" || typeof rawAmount === "number" ? Number(rawAmount) : NaN;
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : null;
  const host = (await getLavaInvoiceHost(invoiceId)) ?? "";
  // Agency Pack invoices carry the "pack:<chatId>" marker in the host field
  if (host.startsWith("pack")) {
    if (await ensurePackGranted(invoiceId)) {
      const chatId = host.slice(5);
      if (chatId) await setChatPack(chatId, invoiceId);
    }
    void ledgerPurchase({
      paymentId: invoiceId,
      provider: "lava",
      plan: "lpack",
      amount,
      currency: "USD",
      chatId: null,
      status: "succeeded",
    });
    return NextResponse.json({ ok: true });
  }
  // idempotent by design: activatePass overwrites the pass record;
  // the "pro:<host>" marker marks the 30-day Pro Pass invoice
  if (host) {
    const proHost = proHostFromLavaMarker(host);
    if (proHost) {
      await activatePass(invoiceId, proHost, PRO_PASS_DAYS);
    } else {
      await activatePass(invoiceId, host);
    }
    void ledgerPurchase({
      paymentId: invoiceId,
      provider: "lava",
      plan: proHost ? "lpro" : "lpass",
      amount,
      currency: "USD",
      chatId: null,
      status: "succeeded",
    });
  }
  return NextResponse.json({ ok: true });
}
