"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Schützt geschützte Seiten. Zeigt Kinder nur, wenn ein User eingeloggt ist.
 * - Auf /login wird NICHT umgeleitet.
 * - Verhindert Redirect-Loops.
 */
export default function RequireAuth({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const redirectedRef = useRef(false); // blockt doppelte Redirects

  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const { data, error } = await supabase().auth.getSession();
        const hasUser = !!data?.session?.user;

        if (!hasUser && !isLoginRoute && !redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login");
          return;
        }
        if (alive) setReady(true);
      } catch {
        if (!isLoginRoute && !redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login");
          return;
        }
        if (alive) setReady(true);
      }
    };

    run();

    // Session-Änderungen beobachten (Logout/Login)
    const { data: sub } = supabase().auth.onAuthStateChange((_event, session) => {
      const hasUser = !!session?.user;
      if (!hasUser && !isLoginRoute && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/login");
      }
      if (hasUser && isLoginRoute && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/dashboard");
      }
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginRoute]);

  // Auf /login zeigen wir IMMER die Seite (Login ist öffentlich)
  if (isLoginRoute) return children;

  if (!ready) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#64748b" }}>
        Wird geladen …
      </div>
    );
  }

  return children;
}
