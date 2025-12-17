"use client";

import { useEffect } from "react";

/**
 * Liest ?rep=XYZ beim ersten Besuch und speichert ihn
 * in sessionStorage, damit /sign -> /api/sign/submit ihn mitschickt.
 */
export default function RepTracker() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const rep = url.searchParams.get("rep");
      if (rep) sessionStorage.setItem("sb_rep_code", rep.trim());
    } catch {}
  }, []);
  return null;
}
