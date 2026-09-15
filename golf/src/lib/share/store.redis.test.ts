import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteShare, newShareId, readShare, writeShare } from "./store";

/**
 * Runs only against a real Redis: TEST_REDIS_URL=redis://:pw@127.0.0.1:6379.
 * The REST dialect is plain fetch and is covered by the route-level checks;
 * this is the wire-protocol path, which has a client library and a socket in
 * it and so has more ways to be wrong.
 */
const live = process.env.TEST_REDIS_URL;

describe.skipIf(!live)("share store over the Redis wire protocol", () => {
  const saved = { ...process.env };

  beforeAll(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.REDIS_URL = live;
  });

  afterAll(() => {
    process.env = saved;
  });

  it("writes, reads back, and deletes", async () => {
    const id = newShareId();
    expect(await readShare(id)).toBeNull();
    await writeShare(id, '{"round":"x"}', 3600);
    expect(await readShare(id)).toBe('{"round":"x"}');
    await deleteShare(id);
    expect(await readShare(id)).toBeNull();
  });

  it("does not hold the connection open afterwards", async () => {
    // Thirty is the whole allowance on the free tier. Sixty commands in a
    // row must not accumulate sockets.
    const id = newShareId();
    for (let i = 0; i < 60; i += 1) {
      await writeShare(id, String(i), 60);
    }
    expect(await readShare(id)).toBe("59");
    await deleteShare(id);
  });

  it("fails fast with a 502 when the store is unreachable", async () => {
    process.env.REDIS_URL = "redis://:nope@127.0.0.1:1";
    const started = Date.now();
    await expect(readShare("anything")).rejects.toMatchObject({ status: 502 });
    expect(Date.now() - started).toBeLessThan(5_000);
    process.env.REDIS_URL = live;
  });
});
