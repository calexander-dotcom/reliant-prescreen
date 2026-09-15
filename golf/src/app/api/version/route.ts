import { NextResponse } from "next/server";
import { currentBuild } from "@/lib/build";

export const dynamic = "force-dynamic";

/**
 * GET -> { build }
 *
 * The id of the build answering. The page carries the id it was served with,
 * and when the two differ a deploy has landed since. Never cached: not by the
 * worker, which skips /api/, and not by anything in between.
 */
export function GET() {
  return NextResponse.json(
    { build: currentBuild() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
