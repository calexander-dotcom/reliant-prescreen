import { NextResponse } from "next/server";
import { ghinFavoriteCourses } from "@/lib/ghin/client";
import { bearerToken, handleRouteError, unauthorized } from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { courses, probes } */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  try {
    const { items, probes } = await ghinFavoriteCourses(token);
    return NextResponse.json({ courses: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
