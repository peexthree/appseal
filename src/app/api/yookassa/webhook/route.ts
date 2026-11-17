import { NextRequest, NextResponse } from "next/server";
import { getPayment } from "@/lib/yookassa";
import { activatePass, daysForKind, ensurePackGranted, setChatPack } from "@/lib/passes";
import { getConnIp, ipAllowed } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * YooKassa HTTP notification endpoint.
 *
 * Two trust layers before any provider API call:
 * 1. the source IP must match YooKassa's published notification ranges
 *    (https://yookassa.ru/developers/using-api/webhooks) - fakes bounce here
 *    without ever reaching getPayment; YOOKASSA_WEBHOOK_IPS overrides the
 *    built-in list ("*" = allow any source);
 * 2. the body is NOT trusted (YooKassa does not sign webhooks): we re-fetch
 *    the payment from the API and act only on that response.
 * Unknown events and failures still answer 200 so YooKassa stops retrying.
 */
const YOOKASSA_NOTIFICATION_IPS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11",
  "77.75.156.35",
  "2a02:5180::/32",
];

export async function POST(req: NextRequest) {
  const allowlist = (process.env.YOOKASSA_WEBHOOK_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = allowlist.length ? allowlist : YOOKASSA_NOTIFICATION_IPS;
  // getConnIp prefers x-real-ip / the last XFF hop: a client-supplied
  // first-XFF entry can no longer spoof the YooKassa allowlist
  const ip = getConnIp(req.headers);
  if (!ipAllowed(ip, list)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as { event?: string; object?: { id?: string } };
    if (body.event !== "payment.succeeded" || !body.object?.id) {
      return NextResponse.json({ ok: true });
    }
    const payment = await getPayment(body.object.id);
    if (!payment || payment.status !== "succeeded") {
      return NextResponse.json({ ok: true });
    }
    const meta = payment.metadata ?? {};
    if (meta.kind === "lpack") {
      // Agency Pack: grant 5 redeemable credits, bind the chat for /redeem
      if (await ensurePackGranted(payment.id)) {
        if (meta.chatId) await setChatPack(meta.chatId, payment.id);
      }
      return NextResponse.json({ ok: true });
    }
    // "lpro" is the 30-day Pro Pass; the metadata contract is unchanged
    if (meta.kind !== "lpass" && meta.kind !== "lpro") {
      return NextResponse.json({ ok: true });
    }
    // no personal data is stored: the payer email lives in YooKassa only
    await activatePass(payment.id, meta.host ?? "", daysForKind(meta.kind));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
