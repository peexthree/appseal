/**
 * API tokens for Pro Pass holders: machine access to /api/scan without the
 * daily free quota (the per-IP concurrency lock still applies - it protects
 * the engine, not the funnel).
 *
 * Storage: Redis primary (`apitoken:{sha256}` with the pass-length TTL),
 * Postgres mirror as a durable fallback. Only the token HASH is stored -
 * the raw token is shown once in the bot and never persisted.
 */

import { createHash, randomBytes } from "node:crypto";
import { redisCommand } from "./passes.ts";
import { isDbEnabled, saveApiTokenRow, findApiTokenRow } from "./db/index.ts";

const TOKEN_RE = /^as_[a-f0-9]{32}$/;
const TOKEN_TTL_SECONDS = 31 * 24 * 3600; // Pro Pass length + grace
const CHAT_ID_RE = /^-?\d{3,20}$/;

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Mint one token for a chat (the bot validates the active Pro Pass first). */
export async function issueApiToken(chatId: string): Promise<{ token: string; expiresAt: string } | null> {
  const id = chatId.trim();
  if (!CHAT_ID_RE.test(id)) return null;
  const token = "as_" + randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  const stored = await redisCommand([
    "SET",
    `apitoken:${hashApiToken(token)}`,
    JSON.stringify({ chatId: id, expiresAt }),
    "EX",
    String(TOKEN_TTL_SECONDS),
  ]);
  if (stored === null && !isDbEnabled()) return null;
  void saveApiTokenRow(hashApiToken(token), id, expiresAt);
  return { token, expiresAt };
}

/** Bearer-token check for the scan route: null = no/invalid token. */
export async function lookupApiToken(token: string): Promise<{ chatId: string } | null> {
  const clean = (token ?? "").trim();
  if (!TOKEN_RE.test(clean)) return null;
  const hash = hashApiToken(clean);
  const raw = await redisCommand<string>(["GET", `apitoken:${hash}`]);
  if (raw) {
    try {
      const rec = JSON.parse(raw) as { chatId: string; expiresAt: string };
      if (new Date(rec.expiresAt).getTime() > Date.now()) return { chatId: rec.chatId };
      return null;
    } catch {
      return null;
    }
  }
  // Redis miss -> durable mirror (a flushed Redis must not kill valid tokens)
  if (isDbEnabled()) {
    const row = await findApiTokenRow(hash);
    if (row) {
      if (!row.expiresAt || new Date(row.expiresAt).getTime() > Date.now()) {
        return { chatId: row.chatId };
      }
    }
  }
  return null;
}

/** Extract a Bearer token from the standard header or the CI-friendly alias. */
export function tokenFromHeaders(headers: Headers): string {
  const auth = headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (headers.get("x-api-token") ?? "").trim();
}
