import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home({ searchParams }) {
  const ref = searchParams?.ref || searchParams?.code || null;
  if (ref) {
    redirect(`/empfehlen?ref=${encodeURIComponent(ref)}`);
  }
  redirect("/login");
}
