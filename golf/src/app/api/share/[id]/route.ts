import { NextResponse } from "next/server";
import {
  isSharedRound,
  publishableRound,
  SHARE_TTL_SECONDS,
  type SharedRound,
} from "@/lib/share/payload";
import {
  MAX_SHARE_BYTES,
  shareBearer,
  storeFailure,
} from "@/lib/share/route-helpers";
import { deleteShare, readShare, tokenAuthorizes, writeShare } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(id: string): Promise<SharedRound | null> {
  const raw = await readShare(id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SharedRound;
  } catch {
    return null;
  }
}

/**
 * GET -> { round, updatedAt }
 *
 * The public, read-only view. There is no write path here: publishing needs
 * the token, which never leaves the scoring device, so a viewer holding this
 * link can only ever read.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const stored = await load(params.id);
    if (!stored) {
      return NextResponse.json(
        { error: "That shared round has expired or was never here." },
        { status: 404 },
      );
    }
    return NextResponse.json({ round: stored.round, updatedAt: stored.updatedAt });
  } catch (error) {
    return storeFailure(error);
  }
}

/** PUT { round } with the write token -> publishes an update. */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = shareBearer(request);
  if (!token) {
    return NextResponse.json({ error: "A write token is required." }, { status: 401 });
  }

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

  const payload = JSON.stringify({
    round: publishableRound(round as never),
    updatedAt: new Date().toISOString(),
  });
  if (payload.length > MAX_SHARE_BYTES) {
    return NextResponse.json({ error: "That round is too large to share." }, { status: 413 });
  }

  try {
    if (!tokenAuthorizes(token, params.id)) {
      return NextResponse.json({ error: "Wrong write token." }, { status: 403 });
    }
    // Deliberately not conditional on the round still being there. The store
    // has no persistence on the free tier, so a round can evaporate mid-play;
    // writing unconditionally puts it back on the next edit instead of killing
    // a link that has already been handed round the group.
    await writeShare(params.id, payload, SHARE_TTL_SECONDS);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeFailure(error);
  }
}

/** DELETE with the write token -> stops sharing. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = shareBearer(request);
  if (!token) {
    return NextResponse.json({ error: "A write token is required." }, { status: 401 });
  }

  try {
    if (!tokenAuthorizes(token, params.id)) {
      return NextResponse.json({ error: "Wrong write token." }, { status: 403 });
    }
    // Already gone is the outcome the caller wanted.
    await deleteShare(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeFailure(error);
  }
}
