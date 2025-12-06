// app/api/me/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServerAuth();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, org_id, team_id, role, full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!profile)
      return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email }, profile });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
