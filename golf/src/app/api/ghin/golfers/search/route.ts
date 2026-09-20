import { NextResponse } from "next/server";
import { ghinSearchGolfers } from "@/lib/ghin/client";
import {
  bearerToken,
  handleRouteError,
  jsonError,
  unauthorized,
} from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?q=Alexander&state=FL, ?q=Chris%20Alexander or ?q=1234567 -> { players, probes }
 *
 * A name needs a state or it is searched across the whole country; a GHIN
 * number returns that golfer directly. Either way the result carries the
 * golfer's current handicap index.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const state = (params.get("state") ?? "").trim();
  if (query.length < 3) {
    return jsonError("Enter a last name or a full GHIN number.", 400);
  }

  try {
    const { items, probes } = await ghinSearchGolfers(token, query, state || null);
    return NextResponse.json({ players: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
