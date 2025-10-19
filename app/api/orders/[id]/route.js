// app/api/orders/[id]/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function DELETE(_req, { params }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });

    const supabase = supabaseServerAuth();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
    if (!profile || profile.role !== "ADMIN") return NextResponse.json({ error: "Nur Admin darf löschen" }, { status: 403 });

    let data, error;
    try {
      const admin = supabaseAdmin();
      ({ data, error } = await admin.from("orders").delete().eq("id", id).select("id").maybeSingle());
    } catch (e) {
      ({ data, error } = await supabase.from("orders").delete().eq("id", id).select("id").maybeSingle());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

