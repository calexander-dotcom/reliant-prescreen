import { NextResponse } from "next/server";
import { GhinError } from "./client";

/** Pull the GHIN session token off the incoming request. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export function jsonError(message: string, status: number, detail?: string | null) {
  return NextResponse.json({ error: message, detail: detail ?? null }, { status });
}

export function unauthorized() {
  return jsonError("Sign in to GHIN first.", 401);
}

/**
 * Turn anything thrown in a route handler into a clean JSON response.
 * GHIN's own error text is passed through so a broken field mapping is
 * debuggable, but nothing about the request (which carries a password on the
 * login route) is ever logged or echoed.
 */
export function handleRouteError(error: unknown) {
  if (error instanceof GhinError) {
    return jsonError(error.message, error.status >= 400 ? error.status : 502, error.detail);
  }
  return jsonError("Unexpected error talking to GHIN.", 500);
}
