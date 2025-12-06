// app/api/teams/list/route.js
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

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("org_id, team_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
    if (!me) return NextResponse.json({ error: "Profil fehlt" }, { status: 403 });

    const { data, error } = await supabase
      .from("teams")
      .select("id, name")
      .eq("org_id", me.org_id)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, rows: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
