import { NextResponse } from "next/server";
import { jsonError } from "@/lib/ghin/route-helpers";
import { GgError, fetchFoursome, ggApiKey, resolveFoursome } from "@/lib/gg/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gg/resolve?ggid=XXXX
 *
 * Finds the round a foursome GGID belongs to and returns that foursome's
 * players, course and scores. Called once when a round is set up; the browser
 * then keeps eventId and roundId and polls /api/gg/foursome. The key stays on
 * the server; only the normalized foursome (no emails or account internals)
 * goes back.
 */
export async function GET(request: Request) {
  const key = ggApiKey();
  if (!key) return jsonError("Golf Genius is not connected on this deployment.", 501);

  const ggid = new URL(request.url).searchParams.get("ggid")?.trim();
  if (!ggid) return jsonError("A GGID is required.", 400);

  try {
    const location = await resolveFoursome(key, ggid);
    if (!location) return jsonError("No current round was found for that GGID.", 404);
    const foursome = await fetchFoursome(key, location.eventId, location.roundId, ggid);
    if (!foursome) return jsonError("Could not read that foursome.", 404);
    return NextResponse.json({
      eventId: location.eventId,
      roundId: location.roundId,
      eventName: location.eventName,
      foursome,
    });
  } catch (error) {
    if (error instanceof GgError) return jsonError(error.message, error.status);
    return jsonError("Golf Genius request failed.", 502);
  }
}
