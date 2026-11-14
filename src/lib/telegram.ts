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
  const body = JSON.stringify({ chat_id: chatId, text });
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
