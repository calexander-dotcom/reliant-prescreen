import { beforeEach, describe, expect, it } from "vitest";
import {
  missingStore,
  newShareId,
  storeConfig,
  tokenAuthorizes,
  writeTokenFor,
} from "./store";

beforeEach(() => {
  process.env.SHARE_TOKEN_SECRET = "test-secret-for-share-tokens";
});

describe("share ids", () => {
  it("makes unguessable ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newShareId()));
    expect(ids.size).toBe(200);
    // 16 random bytes, url-safe: long enough that the link is the secret.
    expect([...ids][0].length).toBeGreaterThanOrEqual(20);
    expect([...ids][0]).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("write tokens", () => {
  it("gives every share a different token", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => writeTokenFor(newShareId())),
    );
    expect(tokens.size).toBe(200);
    expect([...tokens][0].length).toBeGreaterThanOrEqual(40);
  });

  it("accepts the right token and refuses the rest", () => {
    const id = newShareId();
    const token = writeTokenFor(id);
    expect(tokenAuthorizes(token, id)).toBe(true);
    expect(tokenAuthorizes(writeTokenFor(newShareId()), id)).toBe(false);
    expect(tokenAuthorizes("", id)).toBe(false);
    expect(tokenAuthorizes(token.slice(0, -1), id)).toBe(false);
    expect(tokenAuthorizes(`${token}x`, id)).toBe(false);
  });

  it("holds a token for the same id across restarts", () => {
    // The whole point of deriving: nothing is stored, so an evicted round can
    // be republished on the link that is already out with the group.
    const id = newShareId();
    const before = writeTokenFor(id);
    expect(writeTokenFor(id)).toBe(before);
    expect(tokenAuthorizes(before, id)).toBe(true);
  });

  it("cannot be derived from the share id alone", () => {
    // A viewer has the id, because the id is the link. It must not be enough.
    const id = newShareId();
    const mine = writeTokenFor(id);
    process.env.SHARE_TOKEN_SECRET = "a-different-server-secret";
    expect(writeTokenFor(id)).not.toBe(mine);
    expect(tokenAuthorizes(mine, id)).toBe(false);
  });

  it("does not leak the id or the secret", () => {
    const id = newShareId();
    const token = writeTokenFor(id);
    expect(token).not.toContain(id);
    expect(token).not.toContain("test-secret-for-share-tokens");
  });
});

describe("storeConfig", () => {
  it("reads Vercel KV variables as REST", () => {
    expect(
      storeConfig({ KV_REST_API_URL: "https://kv.example/", KV_REST_API_TOKEN: "t" }),
    ).toEqual({ kind: "rest", url: "https://kv.example", token: "t" });
  });

  it("reads Upstash variables as REST", () => {
    expect(
      storeConfig({
        UPSTASH_REDIS_REST_URL: "https://up.example",
        UPSTASH_REDIS_REST_TOKEN: "t",
      }),
    ).toEqual({ kind: "rest", url: "https://up.example", token: "t" });
  });

  it("prefers REST when an integration injects both", () => {
    expect(
      storeConfig({
        KV_REST_API_URL: "https://kv.example",
        KV_REST_API_TOKEN: "t",
        REDIS_URL: "rediss://default:pw@host:6379",
      }),
    ).toMatchObject({ kind: "rest" });
  });

  it("reads REDIS_URL as the wire protocol", () => {
    expect(storeConfig({ REDIS_URL: "redis://default:pw@host:6379" })).toEqual({
      kind: "redis",
      url: "redis://default:pw@host:6379",
    });
    expect(storeConfig({ REDIS_URL: "rediss://default:pw@host:6380" })).toMatchObject({
      kind: "redis",
    });
  });

  it("finds a REDIS_URL installed under a custom prefix", () => {
    expect(
      storeConfig({ GOLF_BETS_REDIS_URL: "redis://default:pw@host:6379" }),
    ).toMatchObject({ kind: "redis", url: "redis://default:pw@host:6379" });
  });

  it("does not take something that merely mentions redis", () => {
    expect(storeConfig({ REDIS_URL: "not a url" })).toBeNull();
    expect(storeConfig({ REDIS_HOST: "host", REDIS_PASSWORD: "pw" })).toBeNull();
    // A REST url without its token is no use either.
    expect(storeConfig({ KV_REST_API_URL: "https://kv.example" })).toBeNull();
    expect(storeConfig({})).toBeNull();
  });
});

describe("missingStore", () => {
  it("names related variables so a screenshot is enough to fix it", () => {
    const error = missingStore({
      REDIS_HOST: "some-host",
      REDIS_PASSWORD: "hunter2",
      PATH: "/usr/bin",
      NEXT_PUBLIC_THING: "x",
    });
    expect(error.status).toBe(501);
    expect(error.message).toContain("REDIS_HOST, REDIS_PASSWORD");
    expect(error.message).not.toContain("PATH");
  });

  it("never includes a value", () => {
    const error = missingStore({ REDIS_PASSWORD: "hunter2", REDIS_HOST: "some-host" });
    expect(error.message).not.toContain("hunter2");
    expect(error.message).not.toContain("some-host");
  });

  it("says when there is nothing at all", () => {
    expect(missingStore({ PATH: "/usr/bin" }).message).toContain("No store variables");
  });
});
