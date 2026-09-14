import { NextResponse } from "next/server";
import { ghinFavoriteCourses } from "@/lib/ghin/client";
import { bearerToken, handleRouteError, unauthorized } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { courses } — courses saved as favorites on the GHIN account. */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  try {
    const courses = await ghinFavoriteCourses(token);
    return NextResponse.json({ courses });
  } catch (error) {
    return handleRouteError(error);
  }
}
