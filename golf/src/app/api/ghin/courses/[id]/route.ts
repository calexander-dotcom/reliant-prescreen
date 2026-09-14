import { NextResponse } from "next/server";
import { ghinCourse } from "@/lib/ghin/client";
import { bearerToken, handleRouteError, unauthorized } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { course } — tees, ratings and hole-by-hole par / stroke index. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  try {
    const course = await ghinCourse(token, params.id);
    return NextResponse.json({ course });
  } catch (error) {
    return handleRouteError(error);
  }
}
