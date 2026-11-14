import { NextRequest, NextResponse } from "next/server";
import { activatePass, getLavaInvoiceHost } from "@/lib/passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lava.top webhook (configured in the dashboard: Integrations -> API ->
 * Add Webhook). Lava authenticates by echoing our API key in X-Api-Key.
 * payment.success activates the Launch Pass for the host bound at invoice
 * creation; every other event type is acknowledged - the docs require a 2xx
 * within 10 seconds for unknown events too.
 */
export async function POST(req: NextRequest) {
  const key = (req.headers.get("x-api-key") ?? "").trim();
  const expected = (process.env.LAVATOP_API ?? "").trim();
  if (!expected || key !== expected) {
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
  const host = (await getLavaInvoiceHost(invoiceId)) ?? "";
  // idempotent by design: activatePass overwrites the pass record
  if (host) {
    await activatePass(invoiceId, host);
  }
  return NextResponse.json({ ok: true });
}
