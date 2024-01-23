import { kv } from "@vercel/kv";

const RATE_LIMIT: number = 1000;

/**
 * Returns the period where `time` belongs to.
 * Currently it is the utc date separated by '-' (no padding).
 *
 * For example: `2024-1-1`
 */
function getPeriodKey(time: Date): string {
  const year = time.getUTCFullYear();
  const month = time.getUTCMonth() + 1;
  const day = time.getUTCDate();
  const key = `${year}-${month}-${day}`;
  return key;
}

const SECONDS_OF_2_DAYS = 172800; /* 2 * 24 * 60 * 60 */

function getExpireTimestampInSeconds(time: Date): number {
  const firstDayOfMonth = new Date(time);
  firstDayOfMonth.setUTCDate(1);

  const expire =
    Math.ceil(firstDayOfMonth.getTime() / 1000) + SECONDS_OF_2_DAYS;

  return expire;
}

export default async function incrementAndCheckRateLimit(
  repoId: string,
): Promise<
  | { rateLimitEnabled: false; exceeded?: undefined }
  | { rateLimitEnabled: true; exceeded: boolean }
> {
  if (!process.env.KV_REST_API_URL) {
    return { rateLimitEnabled: false };
  }

  const current = new Date();

  const currentPeriodKey = getPeriodKey(current);

  const key = `${currentPeriodKey}:${repoId}`;

  const currentRequests = await kv.incr(key);

  const exceeded = currentRequests > RATE_LIMIT;
  if (!exceeded) {
    const expire = getExpireTimestampInSeconds(current);
    await kv.expireat(key, expire);
  }

  return { rateLimitEnabled: true, exceeded };
}