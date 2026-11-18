import { after, NextRequest, NextResponse } from "next/server";
import { insertReview, isDbEnabled, listApprovedReviews } from "@/lib/db/index";
import { hashIp, redisCommand } from "@/lib/passes";
import { getClientIp } from "@/lib/sec";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** strict domain shape (same pattern as passes.ts): lowercase, no www */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** POST rate limit: 3 reviews per day per IP (UTC-day window pinned by NX) */
const REVIEWS_RATE_LIMIT = 3;
const REVIEWS_RATE_WINDOW_S = 86400;

/** Approved reviews for the showcase. The DB being off is an honest empty
 *  list (200), not an error - the storefront just renders "be the first". */
export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 12;
  const reviews = await listApprovedReviews(Math.min(50, limit));
  return NextResponse.json(
    { reviews },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

/** Queue a review for moderation. The Telegram verdict buttons carry the
 *  inserted row id; nothing goes public without a moderator click. */
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    rating?: number;
    host?: string;
    body?: string;
    lang?: string;
    consent?: boolean;
    website?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }

  // honeypot: the "website" field is visually hidden and never rendered for
  // humans - only bots fill it. Answer success and drop the submission.
  const website = typeof body.website === "string" ? body.website.trim() : "";
  if (website) {
    return NextResponse.json({ ok: true });
  }

  // 152-FZ publication consent: the nickname goes on a public page, so a
  // review without an explicit consent flag is rejected before anything else
  // runs (the web form validates this too - the API gate covers direct calls)
  if (body.consent !== true) {
    return NextResponse.json({ error: "consent_required" }, { status: 400 });
  }

  // validation: nickname only (no email by design, 152-FZ), rating 1-5,
  // body 10-500. The host is optional: a malformed one degrades to null
  // instead of rejecting the whole review.
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  const rating = Number(body.rating);
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (name.length < 2 || name.length > 40) {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }
  if (text.length < 10 || text.length > 500) {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }
  const rawHost =
    typeof body.host === "string"
      ? body.host
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "")
          .replace(/^www\./, "")
      : "";
  const host = rawHost && HOST_RE.test(rawHost) ? rawHost : null;
  const lang = body.lang === "en" ? "en" : "ru";

  // per-IP daily rate limit over the same Upstash REST mechanism as the scan
  // quota: SET NX pins the TTL atomically first, then INCR counts (the first
  // INCR after SET "0" NX returns 1; an expire can never be lost between two
  // commands). Redis absent/hiccuping -> the counter fails open.
  const ip = getClientIp(req.headers);
  const rlKey = `rev:ip:${hashIp(ip)}`;
  await redisCommand(["SET", rlKey, "0", "EX", String(REVIEWS_RATE_WINDOW_S), "NX"]);
  const used = (await redisCommand<number>(["INCR", rlKey])) ?? 1;
  if (used > REVIEWS_RATE_LIMIT) {
    return NextResponse.json({ error: "review_rate_limited" }, { status: 429 });
  }

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "reviews_unavailable" }, { status: 503 });
  }

  const id = await insertReview({ name, rating, host, body: text, lang });
  if (!id) {
    return NextResponse.json({ error: "reviews_unavailable" }, { status: 503 });
  }

  // Moderation alert with approve/reject/feature inline buttons. Plain text (no HTML
  // parse mode), so no escaping is needed; after() keeps the serverless
  // function alive until the Bot API call resolves without blocking the
  // response - a bare void promise can be frozen mid-flight.
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  if (chatId) {
    after(() =>
      sendTelegramMessage(
        chatId,
        `🆕 Отзыв с сайта\n${name} (${rating}/5)${host ? ` о ${host}` : ""}:\n${text}`,
        {
          inline_keyboard: [
            [
              { text: "✅ Опубликовать", callback_data: `rev:ok:${id}` },
              { text: "❌ Отклонить", callback_data: `rev:no:${id}` },
              { text: "⭐ В витрину", callback_data: `rev:feat:${id}` },
            ],
          ],
        },
      ),
    );
  }

  return NextResponse.json({ ok: true });
}
