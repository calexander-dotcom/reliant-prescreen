import { NextResponse } from "next/server";
import { ghinSearchCourses } from "@/lib/ghin/client";
import {
  bearerToken,
  handleRouteError,
  jsonError,
  unauthorized,
} from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q=pebble&state=CA -> { courses } */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const state = url.searchParams.get("state")?.trim() || undefined;

  if (query.length < 3) {
    return jsonError("Enter at least three characters of the course name.", 400);
  }

  try {
    const courses = await ghinSearchCourses(token, query, state);
    return NextResponse.json({ courses });
  } catch (error) {
    return handleRouteError(error);
  }
}
