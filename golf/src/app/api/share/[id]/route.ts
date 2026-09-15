import { NextResponse } from "next/server";
import {
  isSharedRound,
  publishableRound,
  SHARE_TTL_SECONDS,
  type StoredShare,
} from "@/lib/share/payload";
import {
  MAX_SHARE_BYTES,
  shareBearer,
  storeFailure,
} from "@/lib/share/route-helpers";
import { deleteShare, readShare, tokenMatches, writeShare } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(id: string): Promise<StoredShare | null> {
  const raw = await readShare(id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredShare;
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
    // The token hash is never handed out, even though it is only a hash.
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

  try {
    const stored = await load(params.id);
    if (!stored) {
      return NextResponse.json({ error: "That share is gone." }, { status: 404 });
    }
    if (!tokenMatches(token, stored.writeTokenHash)) {
      return NextResponse.json({ error: "Wrong write token." }, { status: 403 });
    }

    const payload = JSON.stringify({
      round: publishableRound(round as never),
      updatedAt: new Date().toISOString(),
      // Carried forward unchanged: a republish must not rotate the token.
      writeTokenHash: stored.writeTokenHash,
    });
    if (payload.length > MAX_SHARE_BYTES) {
      return NextResponse.json({ error: "That round is too large to share." }, { status: 413 });
    }

    // Publishing also pushes the expiry out another week.
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
    const stored = await load(params.id);
    // Already gone is the outcome the caller wanted.
    if (!stored) return NextResponse.json({ ok: true });
    if (!tokenMatches(token, stored.writeTokenHash)) {
      return NextResponse.json({ error: "Wrong write token." }, { status: 403 });
    }
    await deleteShare(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeFailure(error);
  }
}
