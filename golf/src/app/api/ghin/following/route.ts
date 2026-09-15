import { NextResponse } from "next/server";
import { ghinFollowing } from "@/lib/ghin/client";
import { bearerToken, handleRouteError, unauthorized } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET -> { players, probes } — the golfers this account follows on GHIN.
 *
 * `probes` records every endpoint tried and the key-only shape of what came
 * back, so an empty result is diagnosable instead of just disappointing.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  try {
    const { items, probes } = await ghinFollowing(token);
    return NextResponse.json({ players: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
