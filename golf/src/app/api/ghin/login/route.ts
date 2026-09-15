import { NextResponse } from "next/server";
import { ghinLogin } from "@/lib/ghin/client";
import { handleRouteError, jsonError } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { emailOrGhin, password } -> { token, golferId, shape }
 *
 * The read endpoints turned out to need this token after all, so signing in is
 * required and not optional. The credentials are used once, here, and are never
 * stored or logged; the token goes back to the browser and lives in
 * sessionStorage.
 *
 * `golferId` is the signed-in golfer's own GHIN number when the response
 * carries it, since the following and courses endpoints take it as a path
 * segment. `shape` is the key-only structure of the response, which is how to
 * find that number if it is somewhere this does not yet look.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  const { emailOrGhin, password } =
    (body as { emailOrGhin?: unknown; password?: unknown }) ?? {};

  if (typeof emailOrGhin !== "string" || typeof password !== "string") {
    return jsonError("Both a GHIN email (or number) and a password are required.", 400);
  }
  if (!emailOrGhin.trim() || !password) {
    return jsonError("Both a GHIN email (or number) and a password are required.", 400);
  }

  try {
    const session = await ghinLogin(emailOrGhin.trim(), password);
    return NextResponse.json(session);
  } catch (error) {
    return handleRouteError(error);
  }
}
