// app/api/referrals/validate/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function norm(code) {
  return (code || "").toString().trim();
}

export async function POST(req) {
  try {
    const { code } = await req.json().catch(() => ({}));
    const raw = norm(code);
    if (!raw) return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
    const c = raw.toUpperCase();

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("referral_codes")
      .select("code, discount_cents, max_uses, uses_count, active, expires_at")
      .eq("code", c)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, reason: "not_found", message: "Code nicht gefunden" });
    if (!data.active) return NextResponse.json({ ok: false, reason: "inactive", message: "Code ist deaktiviert" });
    if (data.expires_at && new Date(data.expires_at) < new Date()) return NextResponse.json({ ok: false, reason: "expired", message: "Code ist abgelaufen" });
    if (data.uses_count >= data.max_uses) return NextResponse.json({ ok: false, reason: "exhausted", message: "Maximale Einlösungen erreicht" });
    return NextResponse.json({ ok: true, code: data.code, discount_cents: data.discount_cents });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
