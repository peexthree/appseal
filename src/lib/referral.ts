/**
 * Referral program "+7 days for both": every chat mints a stable invite code
 * (sha256 of the chat id -> base36, ambiguous glyphs stripped), shares it as
 * a t.me deep link (start=ref_<code>), and when an invited friend buys any
 * pass both sides get +7 days: the friend on top of their brand-new pass,
 * the referrer on their first active pass - or the days are banked in Redis
 * (ref:reward) and ride the referrer's next pass purchase.
 *
 * The code is deterministic from the chat id but one-way: it cannot be
 * reversed back to a chat, so /ref PRE-registers ref:code:{code} = chatId
 * (180d TTL). An arriving /start ref_<code> resolves the referrer through
 * that key; a missing key (stale code, typo) degrades to a plain visit - no
 * crash, no reward, no reply noise.
 *
 * Key layout (all through redisCommand, the same Upstash as passes.ts):
 *   ref:code:{code}      -> referrer chat id      TTL 180d (written at /ref)
 *   ref:invited:{chatId} -> referrer chat id      TTL  90d (SET NX once, at /start ref_)
 *   ref:done:{chatId}    -> "1"                   TTL 180d ("reward paid" marker - once ever)
 *   ref:reward:{chatId}  -> banked days           TTL 180d (INCRBY 7 when no active pass)
 *   ref:count:{chatId}   -> completed invitations TTL 180d (INCRBY 1 per payout)
 *
 * Notification texts live here (not in telegram-bot.ts langpacks) to keep
 * the import graph one-directional: telegram-bot.ts imports parseRefParam
 * from this module, this module imports only passes.ts + telegram.ts.
 */

import { createHash } from "node:crypto";
import { extendHostPass, getChatPassHosts, getPassRecord, redisCommand } from "./passes.ts";
import { sendTelegramMessage } from "./telegram.ts";

export const REF_BONUS_DAYS = 7;
/** the invited binding: how long after the click a first purchase still pays */
export const REF_TTL_S = 90 * 24 * 3600;
/** TTL for the code lookup, the paid marker, the banked days and the counter */
export const REF_REWARD_TTL_S = 180 * 24 * 3600;

const REF_BOT_USERNAME = "AppSeal_Monitor_Bot";
/** base36 glyphs that read as each other in a shared code (0/O, 1/l/I, i/l) */
const REF_CODE_AMBIGUOUS = new Set(["0", "1", "i", "l", "o"]);
const REF_CODE_LEN = 8;
const REF_CODE_RE = /^[a-z0-9]{6,32}$/;
const REF_CHAT_ID_RE = /^-?\d{3,20}$/;

/** Stable short invite code for a chat: sha256(chatId) -> base36 -> first 8
 *  glyphs without 0/1/i/l/o, length contract >= 6 always holds. Deterministic
 *  and pure (hashing only) - unit-testable without Redis. The loop re-seeds
 *  when the filtered stream runs short (probability ~0, but the contract must
 *  hold unconditionally). */
export function refCode(chatId: string): string {
  let seed = String(chatId).trim();
  for (let round = 0; round < 8; round++) {
    const stream = BigInt(`0x${createHash("sha256").update(seed).digest("hex")}`).toString(36);
    let out = "";
    for (const ch of stream) {
      if (REF_CODE_AMBIGUOUS.has(ch)) continue;
      out += ch;
      if (out.length === REF_CODE_LEN) return out;
    }
    seed = `${seed}#${round}`; // practically unreachable
  }
  return "abcdefgh"; // unreachable fallback, still a valid code shape
}

/** "ref_<code>" out of the /start deep link -> lowercased code; null for any
 *  other payload (ru-lp, en-pro, garbage) or a too-short/malformed code.
 *  Uppercase is tolerated and normalized (Telegram clients may shout links). */
export function parseRefParam(start: string): string | null {
  const m = (start ?? "").trim().match(/^ref_([a-z0-9]{6,32})$/i);
  return m ? m[1].toLowerCase() : null;
}

/** t.me deep link carrying the invite code (start_param allows latin/digits). */
export function refLink(code: string): string {
  return `https://t.me/${REF_BOT_USERNAME}?start=ref_${code}`;
}

/** The reward fires exactly once per invited chat: the binding exists and the
 *  paid marker does not. Pure - the "reward once" decision stays testable
 *  without Redis. */
export function shouldReward(invited: boolean, done: boolean): boolean {
  return invited && !done;
}

/** /ref pre-registers the code -> chat mapping so a later /start ref_<code>
 *  can resolve the referrer. Refreshed on every /ref, TTL 180d. */
export async function registerRefCode(chatId: string): Promise<void> {
  const id = chatId.trim();
  if (!REF_CHAT_ID_RE.test(id)) return;
  await redisCommand(["SET", `ref:code:${refCode(id)}`, id, "EX", String(REF_REWARD_TTL_S)]);
}

/** ref:code lookup for an incoming invite code; null for garbage or a stale
 *  key (the visit then simply carries no referral). */
export async function resolveRefCode(code: string): Promise<string | null> {
  const clean = String(code ?? "").trim().toLowerCase();
  if (!REF_CODE_RE.test(clean)) return null;
  const raw = await redisCommand<string>(["GET", `ref:code:${clean}`]);
  return typeof raw === "string" && raw ? raw : null;
}

/** /start ref_<code>: bind the fresh chat to its referrer. Succeeds only when
 *  the code resolves, is not a self-invite and the chat has no binding yet
 *  (SET NX keeps a concurrent /start from overwriting). Returns the referrer
 *  chat id, null for a plain visit. */
export async function recordRefJoin(chatId: string, code: string): Promise<string | null> {
  const id = chatId.trim();
  if (!REF_CHAT_ID_RE.test(id)) return null;
  const referrer = await resolveRefCode(code);
  if (!referrer || referrer === id) return null;
  const won = await redisCommand<string>([
    "SET",
    `ref:invited:${id}`,
    referrer,
    "EX",
    String(REF_TTL_S),
    "NX",
  ]);
  return won === "OK" ? referrer : null;
}

/** What the payout did for each side - the route turns this into texts. */
export interface ReferralReward {
  referrerChatId: string;
  /** where the referrer's +7 went: an active pass was extended (host in
   *  refHost), the days are banked, or the Redis side-step failed */
  delivered: "pass" | "banked" | "none";
  refHost?: string;
  /** did the +7 land on the newbie's just-activated pass */
  newbieDays: boolean;
}

/** The "+7 for both" payout, called by the webhook route from the check_status
 *  succeeded branch on an invited chat's FIRST purchase. Steps (best-effort
 *  per step, the done marker first so a crash can never double-pay):
 *  (а) SET ref:done; (б) extendHostPass(host, 7) for the friend; (в) the
 *  referrer: first active bound pass gets extended, else INCRBY ref:reward;
 *  (г) INCRBY ref:count. A notification goes to the referrer in the product's
 *  primary language (their own lang is not persisted anywhere). */
export async function rewardReferral(buyerChatId: string, host: string): Promise<ReferralReward | null> {
  try {
    const id = buyerChatId.trim();
    if (!REF_CHAT_ID_RE.test(id)) return null;
    const [invited, done] = await Promise.all([
      redisCommand<string>(["GET", `ref:invited:${id}`]),
      redisCommand<string>(["GET", `ref:done:${id}`]),
    ]);
    const hasInvited = typeof invited === "string" && invited.length > 0;
    if (!hasInvited || !shouldReward(hasInvited, done === "1") || typeof invited !== "string") return null;
    // (а) the paid marker flips first
    await redisCommand(["SET", `ref:done:${id}`, "1", "EX", String(REF_REWARD_TTL_S)]);
    // (б) the friend: +7 days on top of the just-activated pass
    let newbieDays = false;
    try {
      newbieDays = await extendHostPass(host, REF_BONUS_DAYS);
    } catch {
      newbieDays = false;
    }
    // (в) the referrer: the first bound host with a live pass is extended,
    //     otherwise the days wait in ref:reward for their next purchase
    const referrer = invited;
    let delivered: ReferralReward["delivered"] = "none";
    let refHost: string | undefined;
    try {
      for (const h of await getChatPassHosts(referrer)) {
        const rec = await getPassRecord(h);
        // legacy records without `days` still count as live passes here
        if (!rec || (rec.days !== undefined && rec.days <= 0)) continue;
        if (new Date(rec.until).getTime() <= Date.now()) continue;
        if (await extendHostPass(h, REF_BONUS_DAYS)) {
          delivered = "pass";
          refHost = h;
          break;
        }
      }
      if (delivered === "none") {
        await redisCommand(["INCRBY", `ref:reward:${referrer}`, String(REF_BONUS_DAYS)]);
        await redisCommand(["EXPIRE", `ref:reward:${referrer}`, String(REF_REWARD_TTL_S)]);
        delivered = "banked";
      }
    } catch {
      /* the referrer side is best-effort; the payout is already marked */
    }
    // (г) the completed-invitations counter
    try {
      await redisCommand(["INCRBY", `ref:count:${referrer}`, "1"]);
      await redisCommand(["EXPIRE", `ref:count:${referrer}`, String(REF_REWARD_TTL_S)]);
    } catch {
      /* best-effort */
    }
    if (delivered !== "none") {
      try {
        await sendTelegramMessage(referrer, refRewardNotifyText("ru", delivered, refHost), undefined, "HTML");
      } catch {
        /* notifications never break the payment flow */
      }
    }
    return { referrerChatId: referrer, delivered, refHost, newbieDays };
  } catch {
    return null;
  }
}

export interface RefStats {
  /** completed invitations (the friend actually bought a pass) */
  invited: number;
  /** banked days waiting for the referrer's next pass purchase */
  bankedDays: number;
  /** total earned: every completed invitation is worth REF_BONUS_DAYS - the
   *  banked part is a delivered-later subset of that sum, so it is NOT added
   *  on top (an honest number instead of reward + count*7, which would
   *  double-count banked invitations) */
  earnedDays: number;
}

/** /ref numbers: the completed-invitations counter and the banked reward. */
export async function getRefStats(chatId: string): Promise<RefStats> {
  const id = chatId.trim();
  const [cnt, rew] = await Promise.all([
    redisCommand<string>(["GET", `ref:count:${id}`]),
    redisCommand<string>(["GET", `ref:reward:${id}`]),
  ]);
  const invited = Number(cnt) || 0;
  const bankedDays = Number(rew) || 0;
  return { invited, bankedDays, earnedDays: invited * REF_BONUS_DAYS };
}

/** /ref answer: code, share link, honest stats, honest rules. Pure - the
 *  webhook route feeds it with refCommandReply() (or getRefStats() itself). */
export function refInfoText(lang: "ru" | "en", stats: RefStats, code: string): string {
  const banked =
    stats.bankedDays > 0
      ? lang === "en"
        ? `\nBanked: ${stats.bankedDays} days - they will be added to your next pass.`
        : `\nВ копилке: ${stats.bankedDays} дн. - добавятся к вашему следующему пассу.`
      : "";
  return lang === "en"
    ? `🎁 <b>Invite friends - +7 days for each of you</b>\n\n` +
        `Your code: <code>${code}</code>\nLink: ${refLink(code)}\n\n` +
        `Invited: ${stats.invited}\nEarned: ${stats.earnedDays} days${banked}\n\n` +
        `Rules: your friend buys any pass - you both get +7 days: they on top of their new pass, you on your active one (or banked for later - applied at your next pass purchase).`
    : `🎁 <b>Приглашай друзей - по +7 дней каждому</b>\n\n` +
        `Твой код: <code>${code}</code>\nСсылка: ${refLink(code)}\n\n` +
        `Приглашено: ${stats.invited}\nЗаработано: ${stats.earnedDays} дн.${banked}\n\n` +
        `Правила: приглашённый покупает любой пасс - оба получают +7 дней: он к своему новому пассу, вы к активному (или накоплением на будущее - добавятся при следующей покупке пасса).`;
}

/** Referrer notification after the payout (spec wording "🎁 Ваш друг купил
 *  пасс - вам +7 дней: {деталь}"). delivered "none" sends nothing - there is
 *  no honest detail to name. */
export function refRewardNotifyText(
  lang: "ru" | "en",
  delivered: "pass" | "banked" | "none",
  refHost?: string,
): string {
  if (delivered === "none") return "";
  if (lang === "en") {
    return delivered === "pass"
      ? `🎁 Your friend bought a pass - +7 days for you: the active pass on <code>${refHost ?? "?"}</code> is extended. Check /status`
      : `🎁 Your friend bought a pass - +7 days for you: they are banked and will be added to your next pass. Details: /ref`;
  }
  return delivered === "pass"
    ? `🎁 Ваш друг купил пасс - вам +7 дней: продлён активный пропуск на <code>${refHost ?? "?"}</code>. Проверить: /status`
    : `🎁 Ваш друг купил пасс - вам +7 дней: они в копилке и добавятся к вашему следующему пассу. Подробности: /ref`;
}

/** One-call /ref handler for the webhook route: re-registers the code (TTL
 *  refresh keeps the invite resolvable) and renders the answer. */
export async function refCommandReply(chatId: string, lang: "ru" | "en"): Promise<string> {
  await registerRefCode(chatId);
  const stats = await getRefStats(chatId);
  return refInfoText(lang, stats, refCode(chatId));
}
