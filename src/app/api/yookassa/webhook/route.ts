import { NextRequest, NextResponse } from "next/server";
import { getPayment } from "@/lib/yookassa";
import { activatePass } from "@/lib/passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * YooKassa HTTP notification endpoint.
 *
 * The request body is NOT trusted (YooKassa does not sign webhooks): we
 * re-fetch the payment from the API and act only on that response. Unknown
 * events and failures still answer 200 so YooKassa stops retrying.
 */
export async function POST(req: NextRequest) {
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
    if (meta.kind !== "lpass") {
      return NextResponse.json({ ok: true });
    }
    await activatePass(payment.id, meta.host ?? "", meta.email ?? "");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
