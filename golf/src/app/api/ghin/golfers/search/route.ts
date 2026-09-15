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
 * GET ?q=Alexander or ?q=1234567 -> { players, probes }
 *
 * Works whether or not the account has favorites saved: a GHIN number returns
 * that golfer's name and current handicap index directly.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 3) {
    return jsonError("Enter a last name or a full GHIN number.", 400);
  }

  try {
    const { items, probes } = await ghinSearchGolfers(token, query);
    return NextResponse.json({ players: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
