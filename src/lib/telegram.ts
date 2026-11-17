/**
 * Telegram alerts for the Launch Pass monitor. Both env vars must be set
 * (bot token from BotFather + target chat id); without them the monitor
 * degrades silently - background scans still run, alerts are skipped.
 * No chat ids or tokens are ever stored beyond the environment.
 */

import { request } from "node:https";

/**
 * Bot API host is pinned as a literal option field; the token lives in the
 * request path only (Bot API requirement). The socket can therefore never
 * be pointed at anything but api.telegram.org.
 */
export async function sendTelegramAlert(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  return sendTelegramMessage(chatId, text);
}

/** Escape a dynamic value before embedding it into an HTML parse_mode text -
 *  hosts come from a strict regex, but defense in depth costs one call. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Generic Bot API sendMessage (used by the webhook bot): chat id comes from
 *  the incoming update, the token from the env. replyMarkup is a Bot API
 *  reply_markup object (inline_keyboard). parseMode defaults to none - monitor
 *  and digest alerts keep plain text; the bot webhook opts into "HTML". */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: object,
  parseMode?: "HTML",
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (parseMode) payload.parse_mode = parseMode;
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = request(
      {
        host: "api.telegram.org",
        method: "POST",
        path: `/bot${token}/sendMessage`,
        timeout: 10000,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end(body);
  });
}

/** Show the "typing…" indicator in the chat while the bot works on a slow
 *  operation (purchase creation, status poll, /myscans lookups). Best-effort:
 *  false is silently ignored - the state lasts 5s per call and only makes the
 *  bot feel alive. */
export async function sendChatAction(chatId: string, action = "typing"): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  const body = JSON.stringify({ chat_id: chatId, action });
  return new Promise((resolve) => {
    const req = request(
      {
        host: "api.telegram.org",
        method: "POST",
        path: `/bot${token}/sendChatAction`,
        timeout: 5000,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end(body);
  });
}

/** Acknowledge an inline-button press (stops the loading spinner on the
 *  client). An optional text pops a small toast above the button - feedback
 *  like "Принято ✅" or "Проверяю…" without a full message. Best-effort. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !callbackQueryId) return false;
  const payload: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) payload.text = text.slice(0, 200); // Bot API cap for the toast
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = request(
      {
        host: "api.telegram.org",
        method: "POST",
        path: `/bot${token}/answerCallbackQuery`,
        timeout: 10000,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end(body);
  });
}
