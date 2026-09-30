import { NextResponse } from "next/server";
import { jsonError } from "@/lib/ghin/route-helpers";
import { GgError, fetchFoursome, ggApiKey } from "@/lib/gg/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gg/foursome?eventId=..&roundId=..&ggid=..
 *
 * The polling endpoint: re-reads one pairing group's players, course and
 * scores during a round, using the ids the browser kept from /api/gg/resolve.
 * Read-only, key held on the server.
 */
export async function GET(request: Request) {
  const key = ggApiKey();
  if (!key) return jsonError("Golf Genius is not connected on this deployment.", 501);

  const params = new URL(request.url).searchParams;
  const eventId = params.get("eventId")?.trim();
  const roundId = params.get("roundId")?.trim();
  const ggid = params.get("ggid")?.trim();
  if (!eventId || !roundId || !ggid) {
    return jsonError("eventId, roundId and ggid are all required.", 400);
  }

  try {
    const foursome = await fetchFoursome(key, eventId, roundId, ggid);
    if (!foursome) return jsonError("That foursome is no longer on the tee sheet.", 404);
    return NextResponse.json({ foursome });
  } catch (error) {
    if (error instanceof GgError) return jsonError(error.message, error.status);
    return jsonError("Golf Genius request failed.", 502);
  }
}
