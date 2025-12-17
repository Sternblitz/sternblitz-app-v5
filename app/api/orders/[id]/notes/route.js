// app/api/orders/[id]/notes/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });

    const supabase = await supabaseServerAuth();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
    if (!profile) return NextResponse.json({ error: "Profil fehlt" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const sales_notes = typeof body?.sales_notes === "string" ? body.sales_notes : undefined;
    const admin_notes = typeof body?.admin_notes === "string" ? body.admin_notes : undefined;

    // Compose update
    const { data: current, error: getErr } = await supabase
      .from("orders")
      .select("id, custom_notes, counts, sales_notes, backoffice_notes")
      .eq("id", id)
      .maybeSingle();
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 400 });
    if (!current) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    const update = {};
    // Sales/Team/Admin dürfen sales_notes (wir mappen zusätzlich auf custom_notes für Rückwärts-Kompatibilität)
    if (sales_notes !== undefined) {
      update.sales_notes = sales_notes;
      update.custom_notes = sales_notes;
    }
    // Nur Admin darf admin_notes (nun in dedizierter Spalte backoffice_notes)
    if (admin_notes !== undefined) {
      if (profile.role !== "ADMIN") return NextResponse.json({ error: "Nur Admin darf Backoffice‑Notizen" }, { status: 403 });
      update.backoffice_notes = admin_notes;
    }

    let data, error;
    try {
      const admin = supabaseAdmin();
      ({ data, error } = await admin
        .from("orders")
        .update(update)
        .eq("id", id)
        .select("id, custom_notes, counts, sales_notes, backoffice_notes")
        .maybeSingle());
    } catch (e) {
      ({ data, error } = await supabase
        .from("orders")
        .update(update)
        .eq("id", id)
        .select("id, custom_notes, counts, sales_notes, backoffice_notes")
        .maybeSingle());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
