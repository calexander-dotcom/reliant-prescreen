import { describe, expect, it } from "vitest";
import { tokenExpiresAt, tokenNeedsRenewing } from "./session";

/** A token shaped like GHIN's: three base64url parts, the middle one JSON with exp. */
function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${part({ alg: "HS256" })}.${part(payload)}.signature`;
}

describe("the GHIN token's expiry", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");

  it("reads the expiry out of a token that carries one", () => {
    const exp = Math.floor(now / 1000) + 3600 * 20;
    expect(tokenExpiresAt(jwt({ exp }))).toBe(exp * 1000);
    expect(tokenNeedsRenewing(jwt({ exp }), now)).toBe(false);
  });

  it("wants renewing within the last hour, and once it has run out", () => {
    expect(tokenNeedsRenewing(jwt({ exp: Math.floor(now / 1000) + 1800 }), now)).toBe(true);
    expect(tokenNeedsRenewing(jwt({ exp: Math.floor(now / 1000) - 60 }), now)).toBe(true);
  });

  it("says nothing about a token it cannot read", () => {
    expect(tokenExpiresAt("TESTTOKEN")).toBeNull();
    expect(tokenExpiresAt(jwt({ sub: "5694340" }))).toBeNull();
    expect(tokenExpiresAt("a.b")).toBeNull();
    expect(tokenExpiresAt(null)).toBeNull();
    expect(tokenNeedsRenewing("TESTTOKEN", now)).toBe(false);
  });
});
