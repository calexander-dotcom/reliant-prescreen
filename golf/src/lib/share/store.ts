import { createHash, randomBytes } from "node:crypto";

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

/** The scorer keeps this; it is what allows publishing over an existing share. */
export function newWriteToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Only the hash is stored, so someone who reads the store still cannot publish
 * to a round. The token is long and random, so a plain SHA-256 is enough —
 * there is nothing to guess.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparison in constant time, so a wrong token leaks nothing by timing. */
export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = hashToken(token);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
