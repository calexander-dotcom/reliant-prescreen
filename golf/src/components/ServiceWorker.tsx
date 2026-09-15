"use client";

import { useEffect } from "react";

/** Registers the offline shell. Production only, so dev reloads stay honest. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Look for a newer worker on every load, and again when the app is
        // brought back to the foreground, so a deploy lands without the user
        // having to clear anything.
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

  return null;
}
