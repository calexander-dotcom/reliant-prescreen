import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The id of the build that is running. Server only.
 *
 * Read at runtime, never inlined. An inlined constant is compiled into the
 * page and the server separately, and the two only agree if the value is
 * identical on every evaluation of the config — a clock stamp was not, and
 * the halves came out five seconds apart. One runtime read is one source of
 * truth for the whole deployment, static pages included, since they are
 * rendered by this same deployment at build. The deployment's commit on
 * Vercel; otherwise Next's own build id, which changes with every build;
 * failing both, "dev", in which case the page and the server agree and
 * nothing ever updates — right for a copy nobody deploys.
 */
let cached: string | null = null;

export function currentBuild(): string {
  if (cached) return cached;
  cached =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    nextBuildId() ||
    "dev";
  return cached;
}

function nextBuildId(): string | null {
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || null;
  } catch {
    return null;
  }
}
