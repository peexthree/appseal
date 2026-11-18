import { NextRequest, NextResponse } from "next/server";
import { redisConfig, redis, getRegistryEntries } from "@/lib/scanner/store";
import { buildDigest, buildDigestText } from "@/lib/digest";
import { listPaidPasses } from "@/lib/passes";
import { getLatestHostEntry } from "@/lib/scanner/store";
import { sendTelegramAlert, sendTelegramMessage } from "@/lib/telegram";
import { tickSecretOk } from "@/lib/sec";

export const runtime = "nodejs";
export const maxDuration = 30;

const LOCK = "appmot:digest:lock";
// ~6 days: a weekly cron can never double-post even if it drifts
const LOCK_TTL_S = 6 * 24 * 3600;

/**
 * Personal weekly digest: every paid host bound to a bot chat (bindPassChat)
 * gets a private Monday message with its live grade and the pass expiry
 * date. Chats are grouped from listPaidPasses; a chat without registry data
 * (or a web-only purchase with no chat) is simply skipped, and one broken
 * chat never cancels the others. Best-effort around the channel post - the
 * public digest is the primary artifact of this tick.
 */
async function sendPersonalDigests(): Promise<{ chats: number; hosts: number; error?: string }> {
  try {
    const passes = await listPaidPasses();
    // group pass records per bound chat, keeping the expiry date per host
    const byChat = new Map<string, { host: string; until: string }[]>();
    for (const p of passes) {
      if (!p.chatId) continue; // web-only purchase: nobody to write to
      const items = byChat.get(p.chatId) ?? [];
      items.push({ host: p.host, until: p.until });
      byChat.set(p.chatId, items);
    }
    let chats = 0;
    let hosts = 0;
    for (const [chatId, items] of byChat) {
      try {
        const lines: string[] = [];
        for (const item of items) {
          const entry = await getLatestHostEntry(item.host).catch(() => null);
          if (!entry) continue; // never scanned yet - the line is skipped
          lines.push(
            `${item.host} - класс ${entry.grade} (${entry.score}/100), пасс до ${new Date(item.until).toLocaleDateString("ru-RU")}`,
          );
        }
        if (lines.length === 0) continue;
        const text =
          "📊 Ваша неделя в AppSeal:\n" +
          lines.join("\n") +
          `\nПроверить или пересканировать: /scan ${items[0].host}`;
        const ok = await sendTelegramMessage(chatId, text);
        if (ok) {
          chats += 1;
          hosts += lines.length;
        }
      } catch {
        /* one broken chat must not cancel the others */
      }
    }
    return { chats, hosts };
  } catch (e) {
    return { chats: 0, hosts: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Weekly digest post (GHA cron, Monday 09:00 UTC): composes the digest from
 * the live registry and sends it to the Telegram channel, then pushes the
 * personal per-chat digest to bound pass holders. TICK_SECRET configured ->
 * the scheduler must present it (header or ?secret=); unset -> public
 * endpoint, the week-long lock is the throttle - extra calls are no-ops.
 */
export async function GET(req: NextRequest) {
  if (!tickSecretOk(req.headers, req.url, process.env.TICK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = redisConfig();
  if (!cfg) {
    return NextResponse.json({ error: "redis backend required" }, { status: 503 });
  }
  const lock = await redis(cfg, ["SET", LOCK, "1", "EX", String(LOCK_TTL_S), "NX"]);
  if (lock !== "OK") {
    return NextResponse.json({ skipped: true, reason: "rate-locked" });
  }
  try {
    const entries = await getRegistryEntries();
    const d = buildDigest(entries);
    const text = buildDigestText(d);
    const sent = await sendTelegramAlert(text);
    // personal digests are best-effort: their failure must not turn a posted
    // channel digest into a 500 (the lock release below would allow a
    // duplicate channel post on the next call)
    const personal = await sendPersonalDigests();
    const payload: Record<string, unknown> = {
      ok: true,
      sent,
      weekScans: d.weekScans,
      improvers: d.improvers.length,
      anonymousImproved: d.anonymousImproved,
      newcomers: d.newA.length,
      personalChats: personal.chats,
      personalHosts: personal.hosts,
    };
    if (personal.error) payload.personalError = personal.error;
    return NextResponse.json(payload);
  } catch (e) {
    // release the lock so a transient failure can retry on the next call
    await redis(cfg, ["DEL", LOCK]).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
