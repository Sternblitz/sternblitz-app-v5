"use client";
import { usePathname } from "next/navigation";

/**
 * Versteckt die Top-Navigation auf Login-Seiten oder anderen definierten Pfaden.
 * Nutze sie im RootLayout um z. B. <TopNav /> zu umschließen.
 */
export default function HideTopNavOnLogin({ children }) {
  const pathname = usePathname();

  // Seiten, auf denen die TopBar NICHT angezeigt werden soll
  const hiddenRoutes = [
    "/login",
    "/",
    "/empfehlen",
    "/start",
    "/sign",
    "/sign/payment",
    "/seo",
    "/crm",
  ]; // TopBar auf diesen Routen nicht anzeigen

  // Wenn die aktuelle Route in der Liste ist oder mit /admin/crm beginnt → nichts rendern
  if (hiddenRoutes.includes(pathname) || pathname.startsWith("/admin/crm")) return null;

  return children;
}
