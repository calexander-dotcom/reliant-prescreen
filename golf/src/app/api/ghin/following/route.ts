import { NextResponse } from "next/server";
import { ghinFollowedGolfers } from "@/lib/ghin/client";
import {
  bearerToken,
  handleRouteError,
  jsonError,
} from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?golferId=1234567 -> { players, probes }
 *
 * The golfers this GHIN number follows. Needs the session token: without one,
 * or once it has run out, GHIN answers 401 "Invalid token" — the client then
 * drops the session and asks for the password again.
 */
export async function GET(request: Request) {
  const golferId = (new URL(request.url).searchParams.get("golferId") ?? "").trim();
  if (!golferId) return jsonError("A GHIN number is required.", 400);

  try {
    const { items, probes } = await ghinFollowedGolfers(
      golferId,
      bearerToken(request),
    );
    return NextResponse.json({ players: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
