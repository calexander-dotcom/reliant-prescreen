import { NextResponse } from "next/server";
import { ghinFavorites } from "@/lib/ghin/client";
import { bearerToken, handleRouteError, unauthorized } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { players } — the golfers saved as favorites in the GHIN app. */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  try {
    const players = await ghinFavorites(token);
    return NextResponse.json({ players });
  } catch (error) {
    return handleRouteError(error);
  }
}
