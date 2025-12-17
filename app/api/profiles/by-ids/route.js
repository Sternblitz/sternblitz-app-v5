// app/api/profiles/by-ids/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req) {
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
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
    if (!me) return NextResponse.json({ error: "Profil fehlt" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const idsParam = (searchParams.get("ids") || "").trim();
    if (!idsParam)
      return NextResponse.json({ ok: true, map: {} });
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (!ids.length) return NextResponse.json({ ok: true, map: {} });

    let data;
    let error;
    try {
      const admin = supabaseAdmin();
      ({ data, error } = await admin
        .from("profiles")
        .select("user_id, team_id, role, full_name")
        .eq("org_id", me.org_id)
        .in("user_id", ids));
    } catch (adminErr) {
      ({ data, error } = await supabase
        .from("profiles")
        .select("user_id, team_id, role, full_name")
        .eq("org_id", me.org_id)
        .in("user_id", ids));
      if (adminErr) console.error("profiles/by-ids admin fallback", adminErr);
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const map = {};
    for (const row of data || []) {
      map[row.user_id] = { full_name: row.full_name || null, team_id: row.team_id || null, role: row.role || null };
    }
    return NextResponse.json({ ok: true, map });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
