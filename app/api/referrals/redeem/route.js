// app/api/referrals/redeem/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { BASE_PRICE_CENTS, computeFinal } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    // Interne Nutzer (eingeloggt) dürfen keine Promo einlösen
    try {
      const supabase = await supabaseServerAuth();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) return NextResponse.json({ error: "Promo-Code ist für interne Accounts deaktiviert." }, { status: 403 });
    } catch { }
    const { order_id, code, email } = await req.json().catch(() => ({}));
    if (!order_id || !code) return NextResponse.json({ error: "order_id und code erforderlich" }, { status: 400 });
    const c = (code || "").toString().trim().toUpperCase();

    const admin = supabaseAdmin();
    // load code
    const { data: rc, error: rcErr } = await admin
      .from("referral_codes")
      .select("code, referrer_order_id, discount_cents, max_uses, uses_count, active, expires_at")
      .eq("code", c)
      .maybeSingle();
    if (rcErr) return NextResponse.json({ error: rcErr.message }, { status: 400 });

    const now = new Date();
    const valid = rc && rc.active && (!rc.expires_at || new Date(rc.expires_at) > now) && rc.uses_count < rc.max_uses;
    const discount = valid ? Math.max(0, Number(rc.discount_cents || 0)) : Math.max(0, Number(process.env.DEFAULT_REFERRAL_DISCOUNT_CENTS || 2500));
    const base = BASE_PRICE_CENTS;
    const final = computeFinal(base, discount);
    const patch = {
      referral_channel: "referral",
      referral_code: (valid ? rc.code : c),
      referral_referrer_order_id: valid ? (rc.referrer_order_id || null) : null,
      discount_cents: discount,
      total_cents: final,
    };
    const { data: updated, error: updErr } = await admin
      .from("orders")
      .update(patch)
      .eq("id", order_id)
      .select("id, referral_code, discount_cents, referral_channel")
      .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    // increment uses_count only when valid code
    if (valid) {
      try {
        await admin
          .from("referral_codes")
          .update({ uses_count: (rc?.uses_count || 0) + 1 })
          .eq("code", rc.code);
      } catch { }
    }
    return NextResponse.json({ ok: true, order: updated });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
