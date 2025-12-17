// app/dashboard/layout.jsx
"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function DashboardLayout({ children }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let unsub;
    (async () => {
      // initial check
      const { data } = await supabase().auth.getSession();
      if (!data?.session) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname || "/dashboard")}`);
        return;
      }
      setReady(true);
      // keep watching (if user logs out in another tab)
      const { data: sub } = supabase().auth.onAuthStateChange((_event, session) => {
        if (!session) router.replace(`/login?redirect=${encodeURIComponent(pathname || "/dashboard")}`);
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => unsub?.();
  }, [router, pathname]);

  if (!ready) return null; // or a spinner
  return (
    <>
      {children}
    </>
  );
}
