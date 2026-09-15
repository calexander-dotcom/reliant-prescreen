"use client";

import { useEffect, useState } from "react";

/** The reload a newer build triggers carries this, so the worker can tell. */
const UPDATE_PARAM = "u";
/** Remembered before an automatic reload, so a second miss asks instead of looping. */
const RELOADED_FOR = "golfbets.reloadedFor";

function reloadFor(build: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(UPDATE_PARAM, build);
  window.location.replace(url.toString());
}

/**
 * Registers the offline shell, and keeps the app current.
 *
 * The worker cannot do the second part on its own: sw.js does not change
 * between deploys, so checking it for updates finds nothing, and an app
 * installed on the home screen can stay open for days without ever asking
 * for the page again — it has no reload gesture at all. So the page is told
 * the id of the build that served it, asks /api/version for the live one on
 * load and whenever it comes back to the foreground, and reloads itself when
 * it is behind. Not while something is being typed, and not twice for the
 * same build: if a reload still comes back old (the worker served its cached
 * copy), a bar offers the update instead of the page chasing its tail.
 */
export function ServiceWorker({ build }: { build: string }) {
  const [updateReady, setUpdateReady] = useState<string | null>(null);

  useEffect(() => {
    // The marker on a reload has done its job; take it off the address.
    const url = new URL(window.location.href);
    if (url.searchParams.has(UPDATE_PARAM)) {
      url.searchParams.delete(UPDATE_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { build: live } = (await response.json()) as { build?: string };
        if (cancelled || !live || live === build) return;

        const typing = /^(input|textarea|select)$/i.test(
          document.activeElement?.tagName ?? "",
        );
        let reloadedFor: string | null = null;
        try {
          reloadedFor = window.sessionStorage.getItem(RELOADED_FOR);
        } catch {
          // Storage can be off; then every miss shows the bar, which is fine.
        }
        if (!typing && reloadedFor !== live) {
          try {
            window.sessionStorage.setItem(RELOADED_FOR, live);
          } catch {
            // As above.
          }
          reloadFor(live);
          return;
        }
        setUpdateReady(live);
      } catch {
        // Offline, or the server is unreachable: nothing to update from.
      }
    };

    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [build]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Picks up a changed worker; the page itself is handled above.
        void registration.update();
        const onVisible = () => {
          if (document.visibilityState === "visible") void registration.update();
        };
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => {
        // Offline support is a bonus; the app works without it.
      });
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-turf-900 px-4 pb-2 text-sm text-white shadow-md"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <span className="font-semibold">A newer version is ready.</span>
      <button
        type="button"
        onClick={() => reloadFor(updateReady)}
        className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-bold text-turf-900"
      >
        Update
      </button>
    </div>
  );
}
