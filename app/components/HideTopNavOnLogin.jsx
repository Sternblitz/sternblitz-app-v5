"use client";
import { usePathname } from "next/navigation";

/**
 * Versteckt die Top-Navigation auf Login-Seiten oder anderen definierten Pfaden.
 * Nutze sie im RootLayout um z. B. <TopNav /> zu umschließen.
 */
export default function HideTopNavOnLogin({ children }) {
  const pathname = usePathname();

  // Seiten, auf denen die TopBar NICHT angezeigt werden soll
  const hiddenRoutes = ["/login", "/"]; // du kannst hier später z. B. "/register" ergänzen

  // Wenn die aktuelle Route in der Liste ist → nichts rendern
  if (hiddenRoutes.includes(pathname)) return null;

  return children;
}
