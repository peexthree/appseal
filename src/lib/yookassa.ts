/**
 * Minimal YooKassa API client (v3).
 *
 * Auth: Basic shopId:secretKey. Every mutating call carries an
 * Idempotence-Key so retries never double-charge.
 *
 * Webhooks are NOT trusted: on payment.succeeded the handler re-fetches
 * the payment from the API and acts only on that response.
 */

import { randomUUID } from "node:crypto";

const API_BASE = "https://api.yookassa.ru/v3";

export interface YkPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  description?: string;
  metadata?: Record<string, string>;
  confirmation?: { type: string; confirmation_url?: string };
}

export function ykConfig(): { shopId: string; secret: string } | null {
  const shopId = process.env.YOOKASSA_SHOP_ID ?? "";
  const secret = process.env.YOOKASSA_SECRET ?? "";
  if (!shopId || !secret) return null;
  return { shopId, secret };
}

async function ykRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotenceKey?: string,
): Promise<T> {
  const cfg = ykConfig();
  if (!cfg) throw new Error("yookassa not configured");
  const headers: Record<string, string> = {
    authorization: `Basic ${Buffer.from(`${cfg.shopId}:${cfg.secret}`).toString("base64")}`,
    "content-type": "application/json",
  };
  if (idempotenceKey) headers["idempotence-key"] = idempotenceKey;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { description?: string };
  if (!res.ok) {
    throw new Error(`yookassa ${res.status}: ${data.description ?? "request failed"}`);
  }
  return data;
}

/** Create a redirect-confirmation payment. Amount in rubles, e.g. "490.00". */
export async function createPayment(opts: {
  amountRub: string;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  /** when omitted the payment carries no receipt and YooKassa asks the
   *  payer for the receipt email on the checkout page itself */
  receiptEmail?: string;
}): Promise<YkPayment> {
  const payment: Record<string, unknown> = {
    amount: { value: opts.amountRub, currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: opts.returnUrl },
    description: opts.description,
    metadata: opts.metadata,
  };
  if (opts.receiptEmail) {
    // самозанятый: чек уходит в «Мой налог» автоматически
    payment.receipt = {
      customer: { email: opts.receiptEmail },
      items: [
        {
          description: opts.description.slice(0, 128),
          quantity: "1.00",
          amount: { value: opts.amountRub, currency: "RUB" },
          vat_code: 1,
          payment_mode: "full_prepayment",
          payment_subject: "service",
        },
      ],
    };
  }
  return ykRequest<YkPayment>("POST", "/payments", payment, randomUUID());
}

/** Re-fetch a payment by id - the only trusted way to confirm a webhook. */
export async function getPayment(paymentId: string): Promise<YkPayment | null> {
  if (!/^[0-9a-f-]{10,64}$/i.test(paymentId)) return null;
  try {
    return await ykRequest<YkPayment>("GET", `/payments/${paymentId}`);
  } catch {
    return null;
  }
}

export async function cancelPayment(paymentId: string): Promise<YkPayment | null> {
  try {
    return await ykRequest<YkPayment>("POST", `/payments/${paymentId}/cancel`, undefined, randomUUID());
  } catch {
    return null;
  }
}
