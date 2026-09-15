import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "redis";

/**
 * Shared-round storage.
 *
 * Two dialects, because the Vercel marketplace has two kinds of Redis and
 * which one you end up with depends on which tile you tapped:
 *
 * - **REST** (Upstash, and Vercel's own KV): plain HTTPS with a bearer token.
 *   No client library, no connection to manage.
 * - **Wire** (Redis Cloud, or any `redis://` URL — an EC2 box, say): the real
 *   Redis protocol over TCP, spoken by node-redis. One connection per command
 *   rather than a cached client: a serverless function can be frozen and
 *   thawed with a dead socket underneath it, and a fresh connect is ~50 ms
 *   against a store that sees a few hundred commands a round.
 *
 * REST wins when both are present, since Upstash's integration injects both.
 */

type Env = Record<string, string | undefined>;

export type StoreConfig =
  | { kind: "rest"; url: string; token: string }
  | { kind: "redis"; url: string };

const REDIS_SCHEME = /^rediss?:\/\//i;

export function storeConfig(env: Env = process.env): StoreConfig | null {
  const restUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const restToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && restToken) {
    return { kind: "rest", url: restUrl.replace(/\/+$/, ""), token: restToken };
  }

  if (env.REDIS_URL && REDIS_SCHEME.test(env.REDIS_URL)) {
    return { kind: "redis", url: env.REDIS_URL };
  }
  // An integration installed with a custom prefix lands as FOO_REDIS_URL.
  const prefixed = Object.keys(env)
    .filter((name) => name.endsWith("REDIS_URL") && REDIS_SCHEME.test(env[name] ?? ""))
    .sort();
  if (prefixed.length > 0) {
    return { kind: "redis", url: env[prefixed[0]] as string };
  }

  return null;
}

export class StoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

/**
 * The not-configured error, with enough in it to fix the configuration from
 * a screenshot: the *names* of any variables that look store-related but are
 * not a shape this reads. Names only — a value would be a credential.
 */
export function missingStore(env: Env = process.env): StoreError {
  const related = Object.keys(env)
    .filter((name) => /REDIS|UPSTASH|KV_/.test(name))
    .sort();
  const hint =
    related.length > 0
      ? ` Present but not a shape this app reads: ${related.join(", ")}.`
      : " No store variables were found.";
  return new StoreError(
    `Sharing is not set up on this deployment. Connect a Redis or KV store to the project and redeploy.${hint}`,
    501,
  );
}

async function restCommand(
  config: Extract<StoreConfig, { kind: "rest" }>,
  args: string[],
): Promise<unknown> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new StoreError(`The share store returned ${response.status}.`, 502);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new StoreError(payload.error, 502);
  return payload.result ?? null;
}

async function redisCommand(
  config: Extract<StoreConfig, { kind: "redis" }>,
  args: string[],
): Promise<unknown> {
  const client = createClient({
    url: config.url,
    // Fail the request rather than retry in the background: the caller's next
    // poll or publish is the retry, and a function that returns is one that
    // is not holding a connection against the tier's limit of thirty.
    socket: { connectTimeout: 5_000, reconnectStrategy: false },
    disableOfflineQueue: true,
  });
  // node-redis also reports failures as events; unheard, they crash the
  // process. The awaited promise below carries the same error.
  client.on("error", () => {});

  try {
    await client.connect();
    return await client.sendCommand(args);
  } catch (error) {
    throw new StoreError(
      `Could not reach the share store: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  } finally {
    if (client.isOpen) {
      await client.close().catch(() => client.destroy());
    }
  }
}

async function command(args: (string | number)[]): Promise<unknown> {
  const config = storeConfig();
  if (!config) throw missingStore();
  const strings = args.map(String);
  return config.kind === "rest"
    ? restCommand(config, strings)
    : redisCommand(config, strings);
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
  if (!config) throw missingStore();
  // A redis:// URL carries its password, so it is secret material too.
  return config.kind === "rest" ? config.token : config.url;
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
