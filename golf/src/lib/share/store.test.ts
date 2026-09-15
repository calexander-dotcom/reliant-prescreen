import { describe, expect, it } from "vitest";
import { hashToken, newShareId, newWriteToken, tokenMatches } from "./store";

describe("share credentials", () => {
  it("makes unguessable ids and tokens", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newShareId()));
    expect(ids.size).toBe(200);
    // 16 random bytes, url-safe: long enough that the link is the secret.
    expect([...ids][0].length).toBeGreaterThanOrEqual(20);
    expect([...ids][0]).toMatch(/^[A-Za-z0-9_-]+$/);

    const tokens = new Set(Array.from({ length: 200 }, () => newWriteToken()));
    expect(tokens.size).toBe(200);
    expect([...tokens][0].length).toBeGreaterThanOrEqual(40);
  });
});

describe("write tokens", () => {
  it("stores only a hash, never the token", () => {
    const token = newWriteToken();
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });

  it("accepts the right token and refuses the rest", () => {
    const token = newWriteToken();
    const hash = hashToken(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(newWriteToken(), hash)).toBe(false);
    expect(tokenMatches("", hash)).toBe(false);
    expect(tokenMatches(token, "")).toBe(false);
    expect(tokenMatches(token, hash.slice(0, 63))).toBe(false);
  });

  it("is deterministic for the same token", () => {
    const token = newWriteToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });
});
