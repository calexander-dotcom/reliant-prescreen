import { beforeEach, describe, expect, it } from "vitest";
import { newShareId, tokenAuthorizes, writeTokenFor } from "./store";

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
