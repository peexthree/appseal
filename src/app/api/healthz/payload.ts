/**
 * Pure building blocks for the /api/healthz probe, split out of route.ts so
 * tests can assert the payload contract without pulling next/server into
 * plain node --test.
 */

export type RedisState = "up" | "down" | "skipped";

/** Lightweight ping key: a GET against a key nothing ever writes - the
 *  round-trip itself (not the value) proves the Redis backend answers. */
export const HEALTH_PING_KEY = "appmot:healthz:ping";

/** Health check budget: the probe must stay well under the 5s Docker
 *  HEALTHCHECK timeout. */
export const HEALTH_PING_TIMEOUT_MS = 2000;

/** Exactly the fields the probe answers with - no secrets, no env-derived
 *  values beyond uptime and the redis state word. */
export interface HealthPayload {
  ok: true;
  uptime: number;
  redis: RedisState;
  ts: string;
}

export function buildHealthPayload(redisState: RedisState, now: Date = new Date()): HealthPayload {
  return {
    ok: true,
    uptime: process.uptime(),
    redis: redisState,
    ts: now.toISOString(),
  };
}
