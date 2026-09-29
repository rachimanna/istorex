"use client";

import { useEffect } from "react";

/** Registers the service worker (offline shell only — it never installs or imitates installing IPAs). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
