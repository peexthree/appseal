/**
 * Magic-link tokens for the web /myscans cabinet: the bot hands out a signed
 * link (no web accounts exist), the page verifies it server-side. The token
 * binds the chat id with a 24h expiry - HMAC over chatId + exp, keyed by the
 * shared tick/webhook secret that is already provisioned in prod. A leaked
 * link exposes ONLY the public registry data of the chat's own domains.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 24 * 3600 * 1000;
const CHAT_ID_RE = /^-?\d{3,20}$/;

function signingKey(): string | null {
  return process.env.TICK_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? null;
}

function hmac(payload: string): string {
  return createHmac("sha256", signingKey() ?? "").update(payload).digest("hex");
}

/** The bot composes the cabinet link: /myscans?t=<token>. */
export function signChatToken(chatId: string): string | null {
  const id = chatId.trim();
  if (!signingKey() || !CHAT_ID_RE.test(id)) return null;
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${id}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

/** Server-side verification for /myscans: null on any mismatch or expiry. */
export function verifyChatToken(token: string): string | null {
  const clean = (token ?? "").trim();
  if (!signingKey() || !/^-?\d{3,20}\.\d{13}\.[a-f0-9]{64}$/.test(clean)) return null;
  const [id, exp, sig] = clean.split(".");
  if (Number(exp) < Date.now()) return null;
  const expected = hmac(`${id}.${exp}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
