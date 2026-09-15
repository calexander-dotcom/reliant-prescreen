import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Shared-round storage.
 *
 * Speaks the Upstash REST protocol, which is what both Vercel's KV stores and
 * the Upstash marketplace integration provide, so no client library and no
 * build-time dependency. Either set of environment variable names works, since
 * which one you get depends on how the store was provisioned.
 */

interface StoreConfig {
  url: string;
  token: string;
}

export function storeConfig(): StoreConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export class StoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

async function command(args: (string | number)[]): Promise<unknown> {
  const config = storeConfig();
  if (!config) {
    throw new StoreError(
      "Sharing is not set up on this deployment. Add a KV store and redeploy.",
      501,
    );
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new StoreError(`The share store returned ${response.status}.`, 502);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new StoreError(payload.error, 502);
  return payload.result ?? null;
}

const KEY_PREFIX = "golfbets:share:";

export async function readShare(id: string): Promise<string | null> {
  const result = await command(["GET", `${KEY_PREFIX}${id}`]);
  return typeof result === "string" ? result : null;
}

export async function writeShare(
  id: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  // Every publish pushes the expiry out, so a share lives on for a week after
  // the last hole rather than a week after the round started.
  await command(["SET", `${KEY_PREFIX}${id}`, value, "EX", ttlSeconds]);
}

export async function deleteShare(id: string): Promise<void> {
  await command(["DEL", `${KEY_PREFIX}${id}`]);
}

/** A share id goes in a link that is the only thing protecting the round. */
export function newShareId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Key material for deriving write tokens.
 *
 * `SHARE_TOKEN_SECRET` if it is set; otherwise the store credential, which is
 * a stable server-only secret that exists exactly when sharing works at all,
 * so sharing needs no extra configuration to be safe. Rotating it invalidates
 * every outstanding write token, which is survivable: shares live a week and
 * a new link costs one tap.
 */
function tokenSecret(): string {
  const explicit = process.env.SHARE_TOKEN_SECRET;
  if (explicit) return explicit;
  const config = storeConfig();
  if (!config) {
    throw new StoreError(
      "Sharing is not set up on this deployment. Add a KV store and redeploy.",
      501,
    );
  }
  return config.token;
}

/**
 * The scorer's write token, derived from the share id rather than stored
 * beside the round.
 *
 * The obvious design — random token, keep its hash in the record — has a hole
 * on a store with no persistence, which is what the free tier is: an eviction
 * takes the hash with the round, and then there is nothing left to check a
 * publish against. Either publishing dies for good on a link already handed
 * out, or a missing record lets anyone holding the link (which is everybody,
 * that being the point of it) claim the share. Deriving instead means the
 * check needs no stored state, so a publish after an eviction simply puts the
 * round back, and a viewer who knows the id still cannot compute the token.
 */
export function writeTokenFor(id: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`golfbets-share-token-v1:${id}`)
    .digest("base64url");
}

/** Constant-time check, so a wrong token leaks nothing by timing. */
export function tokenAuthorizes(token: string, id: string): boolean {
  const expected = Buffer.from(writeTokenFor(id), "utf8");
  const actual = Buffer.from(token, "utf8");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
