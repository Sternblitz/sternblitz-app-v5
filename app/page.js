import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  // Serverseitige Weiterleitung verhindert leere SSR-Ausgabe/404
  redirect("/login");
}
