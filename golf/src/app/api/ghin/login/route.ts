import { NextResponse } from "next/server";
import { ghinLogin } from "@/lib/ghin/client";
import { handleRouteError, jsonError } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { emailOrGhin, password } -> { token }
 *
 * The credentials are used once, to get a token, and are never stored or
 * logged. The token goes back to the browser, which keeps it in sessionStorage
 * and sends it on later requests.
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
    const token = await ghinLogin(emailOrGhin.trim(), password);
    return NextResponse.json({ token });
  } catch (error) {
    return handleRouteError(error);
  }
}
