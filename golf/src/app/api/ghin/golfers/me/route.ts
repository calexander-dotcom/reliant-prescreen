import { NextResponse } from "next/server";
import { ghinGolferProfile } from "@/lib/ghin/client";
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
 * The signed-in golfer's own record. A fallback for when the login response
 * did not carry their name, since the following list is other people and
 * without this the account holder is the one player typed in by hand.
 */
export async function GET(request: Request) {
  const golferId = (new URL(request.url).searchParams.get("golferId") ?? "").trim();
  if (!golferId) return jsonError("A GHIN number is required.", 400);

  try {
    const { items, probes } = await ghinGolferProfile(golferId, bearerToken(request));
    return NextResponse.json({ players: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
