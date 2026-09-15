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
 * The golfers this GHIN number follows. No sign-in required: GHIN serves this
 * from the golfer id alone. A token is forwarded if the caller has one, but it
 * is not needed.
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
