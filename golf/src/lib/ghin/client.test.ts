import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GhinError,
  ghinFollowedGolfers,
  ghinLogin,
  ghinRequest,
  ghinGolferCourses,
  ghinSearchGolfers,
} from "./client";

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
    await expect(ghinLogin("me@example.com", "pw")).resolves.toMatchObject({
      token: "abc123",
    });
  });

  it("fails clearly when the response carries no token", async () => {
    stubFetch(() => ({ status: 200, body: '{"ok":true}' }));
    await expect(ghinLogin("me@example.com", "pw")).rejects.toThrow(
      /no session token/i,
    );
  });
});

describe("ghinFollowedGolfers", () => {
  it("asks the endpoint GHIN's own site uses", async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: '{"golfers":[{"id":1,"first_name":"Ada","last_name":"B","handicap_index_display":"14.2"}]}',
    }));

    const { items, probes } = await ghinFollowedGolfers("1234567");
    expect(calls[0]).toContain("/followed_golfers/1234567.json");
    expect(calls[0]).toContain("source=");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Ada B", handicapIndex: 14.2 });
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({ status: 200, ok: true, parsed: 1 });
  });

  it("works with no token, because the endpoint needs none", async () => {
    let auth: string | null = "unset";
    stubFetch((_url, init) => {
      auth = new Headers(init.headers).get("Authorization");
      return { status: 200, body: '{"golfers":[]}' };
    });
    await ghinFollowedGolfers("1234567");
    expect(auth).toBeNull();
  });

  it("forwards a token when one happens to be available", async () => {
    let auth: string | null = null;
    stubFetch((_url, init) => {
      auth = new Headers(init.headers).get("Authorization");
      return { status: 200, body: '{"golfers":[]}' };
    });
    await ghinFollowedGolfers("1234567", "tok");
    expect(auth).toBe("Bearer tok");
  });

  it("refuses anything that is not a GHIN number rather than building a URL from it", async () => {
    const calls = stubFetch(() => ({ status: 200, body: "{}" }));
    for (const bad of ["../../etc/passwd", "abc", "", "12"]) {
      const { items, probes } = await ghinFollowedGolfers(bad);
      expect(items).toEqual([]);
      expect(probes[0].error).toMatch(/does not look like a GHIN number/i);
    }
    expect(calls).toHaveLength(0);
  });

  it("tolerates a GHIN number typed with spaces or dashes", async () => {
    const calls = stubFetch(() => ({ status: 200, body: '{"golfers":[]}' }));
    await ghinFollowedGolfers(" 123-4567 ");
    expect(calls[0]).toContain("/followed_golfers/1234567.json");
  });

  it("records why every path failed instead of just coming back empty", async () => {
    stubFetch(() => ({ status: 403, body: "blocked by proxy" }));
    const { items, probes } = await ghinFollowedGolfers("1234567");
    expect(items).toEqual([]);
    expect(probes.every((probe: { ok: boolean }) => !probe.ok)).toBe(true);
    expect(probes[0].error).toContain("blocked by proxy");
  });

  it("reports the shape when the keys are not the ones expected", async () => {
    stubFetch(() => ({
      status: 200,
      body: '{"data":{"items":[{"GolferName":"X","Idx":"9.9"}]}}',
    }));
    const { items, probes } = await ghinFollowedGolfers("1234567");
    expect(items).toEqual([]);
    expect(probes[0].shape).toContain("GolferName");
    expect(probes[0].parsed).toBe(0);
    expect(probes[0].shape).not.toContain("9.9");
  });
});

describe("ghinGolferCourses", () => {
  it("merges the pinned list with the recently played one", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("my_courses.json")) {
        return {
          status: 200,
          body: '{"golfer_course_preference":[{"course_id":1,"course_name":"Pinned GC"}]}',
        };
      }
      return {
        status: 200,
        body: '{"courses":[{"CourseId":"2","CourseName":"Recent CC","CourseCity":"Reno"},{"CourseId":"1","CourseName":"Pinned GC"}]}',
      };
    });

    const { items, probes } = await ghinGolferCourses("1234567");
    expect(calls.some((url) => url.includes("/golfers/1234567/my_courses.json"))).toBe(true);
    expect(
      calls.some((url) => url.includes("golfer_most_recent_courses.json")),
    ).toBe(true);
    // Deduped by course id, pinned first.
    expect(items.map((course: { id: string }) => course.id)).toEqual(["1", "2"]);
    expect(items[1]).toMatchObject({ name: "Recent CC", city: "Reno" });
    expect(probes).toHaveLength(2);
  });

  it("still returns the list that worked when the other fails", async () => {
    stubFetch((url) => {
      if (url.includes("my_courses.json")) return { status: 500, body: "" };
      return {
        status: 200,
        body: '{"courses":[{"CourseId":"2","CourseName":"Recent CC"}]}',
      };
    });
    const { items, probes } = await ghinGolferCourses("1234567");
    expect(items).toHaveLength(1);
    expect(probes.some((probe: { ok: boolean }) => !probe.ok)).toBe(true);
  });

  it("validates the GHIN number", async () => {
    const calls = stubFetch(() => ({ status: 200, body: "{}" }));
    const { probes } = await ghinGolferCourses("nope");
    expect(probes[0].error).toMatch(/GHIN number/i);
    expect(calls).toHaveLength(0);
  });
});

describe("ghinSearchGolfers", () => {
  it("treats an all-digits query as a GHIN number lookup", async () => {
    const calls = stubFetch(() => ({ status: 200, body: '{"golfers":[]}' }));
    await ghinSearchGolfers("tok", "1234567");
    expect(calls[0]).toContain("golfer_id=1234567");
  });

  it("searches a lone name as a last name across the country", async () => {
    // GHIN's validation: last_name needs a state, a country or an association.
    const calls = stubFetch(() => ({ status: 200, body: '{"golfers":[]}' }));
    await ghinSearchGolfers("tok", "Alexander");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("last_name=Alexander");
    expect(calls[0]).toContain("country=USA");
    expect(calls[0]).not.toContain("first_name");
    expect(calls[0]).not.toContain("global_search");
  });

  it("splits two words into first and last name", async () => {
    const calls = stubFetch(() => ({ status: 200, body: '{"golfers":[]}' }));
    await ghinSearchGolfers("tok", "Chris Alexander");
    expect(calls[0]).toContain("first_name=Chris");
    expect(calls[0]).toContain("last_name=Alexander");
  });

  it("narrows to a state when given, as typed and as GHIN writes it, then the country", async () => {
    const calls = stubFetch(() => ({
      status: 400,
      body: '{"error":"last_name and state, last_name and country or association_id or club_id are not present"}',
    }));
    await ghinSearchGolfers("tok", "Alexander", "fl");
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("state=FL");
    expect(calls[1]).toContain("state=US-FL");
    expect(calls[2]).toContain("country=USA");
    expect(calls[2]).not.toContain("state=");
  });

  it("returns the golfers it finds", async () => {
    stubFetch(() => ({
      status: 200,
      body: '{"golfers":[{"first_name":"Pat","last_name":"Lee","ghin":"987","handicap_index":"+1.1"}]}',
    }));
    const { items } = await ghinSearchGolfers("tok", "Lee");
    expect(items[0]).toMatchObject({ name: "Pat Lee", handicapIndex: -1.1 });
  });
});
