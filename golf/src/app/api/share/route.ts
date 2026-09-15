import { NextResponse } from "next/server";
import { isSharedRound, publishableRound, SHARE_TTL_SECONDS } from "@/lib/share/payload";
import { MAX_SHARE_BYTES, storeFailure } from "@/lib/share/route-helpers";
import { hashToken, newShareId, newWriteToken, writeShare } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { round } -> { id, token }
 *
 * Starts sharing a round. The id goes in the link anyone can open; the token
 * stays on the scoring device and is the only thing that can publish updates.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const round = (body as { round?: unknown })?.round;
  if (!isSharedRound({ round, updatedAt: "" })) {
    return NextResponse.json({ error: "That is not a round." }, { status: 400 });
  }

  const id = newShareId();
  const token = newWriteToken();
  const payload = JSON.stringify({
    round: publishableRound(round as never),
    updatedAt: new Date().toISOString(),
    writeTokenHash: hashToken(token),
  });

  if (payload.length > MAX_SHARE_BYTES) {
    return NextResponse.json({ error: "That round is too large to share." }, { status: 413 });
  }

  try {
    await writeShare(id, payload, SHARE_TTL_SECONDS);
  } catch (error) {
    return storeFailure(error);
  }

  return NextResponse.json({ id, token });
}
