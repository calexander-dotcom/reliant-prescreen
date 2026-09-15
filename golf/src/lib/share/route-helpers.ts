import { NextResponse } from "next/server";
import { StoreError } from "./store";

/** Rounds are small; anything this big is not one. */
export const MAX_SHARE_BYTES = 256 * 1024;

export function storeFailure(error: unknown) {
  if (error instanceof StoreError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: "Could not reach the share store." },
    { status: 502 },
  );
}

export function shareBearer(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}
