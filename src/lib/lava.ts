/**
 * Lava.top invoices for global buyers: the EN pricing path creates an invoice
 * via gate.lava.top, the buyer pays the $6 offer with a foreign Visa/MC and
 * returns to /?paid=<nonce>. Activation follows the same nonce model as
 * YooKassa - the return URL carries the nonce, GET /api/v1/invoices/{id} is
 * the source of truth, and the payment.success webhook is the backup
 * activator for buyers who never navigate back.
 */

const API_ORIGIN = "https://gate.lava.top"; // pinned literal API host (SSRF-safe)
const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";

export interface LavaCfg {
  apiKey: string;
  offerId: string;
}

export function lavaConfig(): LavaCfg | null {
  const apiKey = (process.env.LAVATOP_API ?? "").trim();
  const offerId = (process.env.LAVA_OFFER_ID ?? "").trim();
  return apiKey && offerId ? { apiKey, offerId } : null;
}

export interface LavaInvoice {
  invoiceId: string;
  url: string;
  paid: boolean;
  status: string;
}

interface RawInvoice {
  id?: unknown;
  invoiceId?: unknown;
  status?: unknown;
  url?: unknown;
  paymentUrl?: unknown;
  payment_url?: unknown;
  confirmationUrl?: unknown;
  data?: RawInvoice;
}

function unwrap(raw: unknown): RawInvoice {
  const obj = (raw ?? {}) as RawInvoice;
  return obj.data && typeof obj.data === "object" ? { ...obj, ...obj.data } : obj;
}

function pickString(obj: RawInvoice, keys: Array<keyof RawInvoice>): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

/** Lava reports statuses like success/paid in the return URL and invoice view. */
function isPaidStatus(status: string): boolean {
  return /^(success|paid|succeeded|completed)$/i.test(status.trim());
}

export async function createLavaInvoice(
  cfg: LavaCfg,
  opts: { email: string; nonce: string },
): Promise<LavaInvoice> {
  const res = await fetch(`${API_ORIGIN}/api/v3/invoice`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-api-key": cfg.apiKey,
    },
    body: JSON.stringify({
      email: opts.email,
      offerId: cfg.offerId,
      currency: "USD",
      // Lava appends invoiceId + status to this URL; our own ?paid= stays intact
      successful_return_url: `${SITE_ORIGIN}/?paid=${encodeURIComponent(opts.nonce)}`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`lava invoice HTTP ${res.status}${text.slice(0, 120)}`);
  }
  const raw = unwrap(await res.json().catch(() => ({})));
  const invoiceId = pickString(raw, ["id", "invoiceId"]);
  const url = pickString(raw, ["url", "paymentUrl", "payment_url", "confirmationUrl"]);
  if (!invoiceId || !url) {
    throw new Error("lava invoice response missing id or url");
  }
  return { invoiceId, url, paid: false, status: "created" };
}

export async function getLavaInvoice(cfg: LavaCfg, invoiceId: string): Promise<LavaInvoice | null> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(invoiceId)) return null;
  const res = await fetch(`${API_ORIGIN}/api/v1/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: { accept: "application/json", "x-api-key": cfg.apiKey },
  });
  if (!res.ok) return null;
  const raw = unwrap(await res.json().catch(() => ({})));
  const status = pickString(raw, ["status"]) || "unknown";
  return {
    invoiceId,
    url: pickString(raw, ["url", "paymentUrl", "payment_url", "confirmationUrl"]),
    paid: isPaidStatus(status),
    status,
  };
}
