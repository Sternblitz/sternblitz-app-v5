// app/api/orders/[id]/status/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["NEW", "PROCESSING", "SUCCESS", "WAITING_PAYMENT", "PAID_DELETED", "COMMISSION_PAID"]);

function normalizeStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (ALLOWED.has(raw)) return raw;
  if (s.includes("neu") || s === "new") return "NEW";
  if (s.includes("bearbeit")) return "PROCESSING";
  if (s.includes("erfolg") || s.includes("success")) return "SUCCESS";
  if (s.includes("zahl") || s.includes("wait")) return "WAITING_PAYMENT";
  if (s.includes("bezahlt") && s.includes("gelöscht")) return "PAID_DELETED";
  if (s.includes("provision") && s.includes("ausbezahlt")) return "COMMISSION_PAID";
  return null;
}

export async function POST(req, { params }) {
  try {
    const { id: orderId } = await params;
    if (!orderId) return NextResponse.json({ error: "orderId fehlt" }, { status: 400 });

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
    if (!profile || profile.role !== "ADMIN") {
      return NextResponse.json({ error: "Nur Admin darf Status setzen" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const next = normalizeStatus(body?.status);
    if (!next) return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });

    // Update with admin key if available, else fallback to session (requires RLS allow)
    let data, error;
    try {
      const admin = supabaseAdmin();
      ({ data, error } = await admin.from("orders").update({ status: next }).eq("id", orderId).select("id, status").maybeSingle());
    } catch (e) {
      ({ data, error } = await supabase.from("orders").update({ status: next }).eq("id", orderId).select("id, status").maybeSingle());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
