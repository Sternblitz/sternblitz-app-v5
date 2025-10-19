export const dynamic = "force-dynamic";

export default function Home() {
  if (typeof window !== "undefined") window.location.href = "/login";
  return null;
}
