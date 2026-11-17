import { NextResponse } from "next/server";
import { redisConfig, redis } from "@/lib/scanner/store";
import { buildHealthPayload, HEALTH_PING_KEY, HEALTH_PING_TIMEOUT_MS, type RedisState } from "./payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for Docker HEALTHCHECK (and uptime monitors):
 * always answers 200 JSON {"ok":true,...} - the "redis" field carries the
 * backend state word ("up" | "down" | "skipped" when no Redis is configured),
 * a failed or timed-out Redis ping never breaks the response. No secrets or
 * keys are ever included.
 */
export async function GET() {
  const cfg = redisConfig();
  let redisState: RedisState = "skipped";
  if (cfg) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        redis(cfg, ["GET", HEALTH_PING_KEY]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("healthz ping timeout")), HEALTH_PING_TIMEOUT_MS);
        }),
      ]);
      redisState = "up";
    } catch {
      redisState = "down";
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return NextResponse.json(buildHealthPayload(redisState));
}
