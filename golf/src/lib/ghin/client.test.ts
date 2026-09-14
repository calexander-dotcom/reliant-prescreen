import { afterEach, describe, expect, it, vi } from "vitest";
import { GhinError, ghinFavorites, ghinLogin, ghinRequest } from "./client";

/** Stand in for fetch with a canned status and body. */
function stubFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: string },
) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (input: URL | string, init: RequestInit = {}) => {
    const url = String(input);
    calls.push(url);
    const { status, body } = handler(url, init);
    return Promise.resolve(
      new Response(body, { status, headers: { "Content-Type": "application/json" } }),
    );
  });
  return calls;
}

/** Capture the parsed JSON body of the next request. */
function captureBody() {
  const sent: Record<string, unknown>[] = [];
  stubFetch((_url, init) => {
    sent.push(JSON.parse(String(init.body ?? "{}")));
    return { status: 200, body: '{"golfer_user":{"golfer_user_token":"tok"}}' };
  });
  return sent;
}

/** Assert the call rejects, and hand back the error already narrowed. */
async function expectGhinError(promise: Promise<unknown>): Promise<GhinError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GhinError);
    return error as GhinError;
  }
  throw new Error("expected the request to reject, but it resolved");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("error reporting", () => {
  it("calls a 401 a credentials problem", async () => {
    stubFetch(() => ({ status: 401, body: '{"error":"bad login"}' }));
    const error = await expectGhinError(ghinRequest("golfers/favorites.json"));
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/rejected the credentials/i);
  });

  it("does NOT blame the password for a 403 from the network", async () => {
    stubFetch(() => ({
      status: 403,
      body: "Host not in allowlist: api2.ghin.com",
    }));
    const error = await expectGhinError(ghinRequest("golfers/favorites.json"));
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/blocked/i);
    expect(error.message).toMatch(/network or firewall/i);
    expect(error.message).not.toMatch(/credential/i);
    // The upstream text is what actually identifies the cause.
    expect(error.detail).toContain("allowlist");
  });

  it("distinguishes rate limits and outages", async () => {
    stubFetch(() => ({ status: 429, body: "" }));
    await expect(ghinRequest("x.json")).rejects.toThrow(/rate limiting/i);
    vi.unstubAllGlobals();
    stubFetch(() => ({ status: 503, body: "" }));
    await expect(ghinRequest("x.json")).rejects.toThrow(/having trouble/i);
  });

  it("reports a non-JSON response rather than throwing a parse error", async () => {
    stubFetch(() => ({ status: 200, body: "<html>maintenance</html>" }));
    const error = await expectGhinError(ghinRequest("x.json"));
    expect(error.message).toMatch(/not JSON/i);
    expect(error.detail).toContain("maintenance");
  });
});

describe("request shape", () => {
  it("sends the source parameter and the bearer token", async () => {
    let auth: string | null = null;
    const calls = stubFetch((_url, init) => {
      auth = new Headers(init.headers).get("Authorization");
      return { status: 200, body: "{}" };
    });
    await ghinRequest("golfers/favorites.json", { token: "tok123" });
    expect(calls[0]).toContain("source=");
    expect(calls[0]).toContain("/golfers/favorites.json");
    expect(auth).toBe("Bearer tok123");
  });
});

describe("ghinLogin payload", () => {
  // Regression: the live endpoint answered 400 {"errors":{"token":["can't be
  // blank"]}} because this field was missing entirely.
  it("sends a non-blank client token", async () => {
    const sent = captureBody();
    await ghinLogin("me@example.com", "pw");
    expect(sent[0].token).toBeTruthy();
    expect(String(sent[0].token).length).toBeGreaterThan(0);
  });

  it("nests the credentials under user, where GHIN reads them", async () => {
    const sent = captureBody();
    await ghinLogin("me@example.com", "pw");
    expect(sent[0].user).toEqual({
      email_or_ghin: "me@example.com",
      password: "pw",
      remember_me: "true",
    });
  });

  it("lets the client token be overridden by config", async () => {
    vi.stubEnv("GHIN_CLIENT_TOKEN", "a-real-token");
    const sent = captureBody();
    await ghinLogin("me@example.com", "pw");
    expect(sent[0].token).toBe("a-real-token");
    vi.unstubAllEnvs();
  });

  it("explains a 400 as a rejected request, not a bad password", async () => {
    stubFetch(() => ({
      status: 400,
      body: '{"errors":{"token":["can\'t be blank"]}}',
    }));
    const error = await expectGhinError(ghinLogin("me@example.com", "pw"));
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/shape of the request/i);
    expect(error.message).not.toMatch(/credential/i);
    expect(error.detail).toContain("can't be blank");
  });
});

describe("ghinLogin", () => {
  it("pulls the token out of a nested login response", async () => {
    stubFetch(() => ({
      status: 200,
      body: '{"golfer_user":{"golfer_user_token":"abc123"}}',
    }));
    await expect(ghinLogin("me@example.com", "pw")).resolves.toBe("abc123");
  });

  it("fails clearly when the response carries no token", async () => {
    stubFetch(() => ({ status: 200, body: '{"ok":true}' }));
    await expect(ghinLogin("me@example.com", "pw")).rejects.toThrow(
      /no session token/i,
    );
  });
});

describe("ghinFavorites", () => {
  it("walks past a 404 path to one that works", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("golfers/favorites.json")) return { status: 404, body: "" };
      if (url.includes("golfer_favorites.json")) {
        return {
          status: 200,
          body: '{"golfers":[{"first_name":"Chris","last_name":"A","ghin":"1","handicap_index":"12.4"}]}',
        };
      }
      return { status: 404, body: "" };
    });

    const players = await ghinFavorites("tok");
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: "Chris A", handicapIndex: 12.4 });
    expect(calls.length).toBe(2);
  });

  it("surfaces a real failure instead of silently returning nothing", async () => {
    stubFetch(() => ({ status: 403, body: "blocked by proxy" }));
    await expect(ghinFavorites("tok")).rejects.toThrow(/blocked/i);
  });
});
