// app/api/orders/list/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const dynamic = "force-dynamic";

// helpers
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfYesterday() { const d = startOfToday(); d.setDate(d.getDate() - 1); return d; }
function startOfNDaysAgo(n) { const d = startOfToday(); d.setDate(d.getDate() - n); return d; }
const toISO = (d) => new Date(d).toISOString();

export async function GET(req) {
  try {
    const supabase = await supabaseServerAuth();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("orders/list profile error", profileError);
      return NextResponse.json({ error: "Profil konnte nicht geladen werden." }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json(
        { error: "Kein Profil für diesen Nutzer gefunden. Bitte Admin kontaktieren." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get("range") || "all").toString(); // today|yesterday|7d|all

    // timeframe
    let gte = null, lt = null;
    if (range === "today") {
      gte = startOfToday(); lt = new Date(gte); lt.setDate(lt.getDate() + 1);
    } else if (range === "yesterday") {
      gte = startOfYesterday(); lt = startOfToday();
    } else if (range === "7d") {
      gte = startOfNDaysAgo(6); lt = new Date();
    }

    let q = supabase
      .from("orders")
      .select(`
        id,
        created_at,
        org_id,
        team_id,
        created_by,
        google_profile,
        google_url,
        company,
        first_name,
        last_name,
        email,
        phone,
        selected_option,
        counts,
        sales_notes,
        backoffice_notes,
        pdf_path,
        pdf_signed_url,
        rep_code,
        option_chosen_count,
        status,
        custom_notes,
        start_total_reviews,
        start_average_rating,
        start_bad_1,
        start_bad_2,
        start_bad_3,
        live_total_reviews,
        live_average_rating,
        live_bad_1,
        live_bad_2,
        live_bad_3,
        last_refreshed_at,
        review_name,
        review_address
        ,
        stripe_customer_id,
        stripe_payment_method_id,
        stripe_setup_intent_id,
        stripe_payment_intent_id,
        payment_method_type,
        payment_status,
        payment_receipt_url,
        payment_last_event,
        charged_amount,
        charge_currency,
        charged_at,
        referral_code,
        referral_channel,
        referral_referrer_order_id,
        discount_cents,
        total_cents,
        referral_award_status,
        referral_award_value_cents,
        referral_awarded_at
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (gte && lt) q = q.gte("created_at", toISO(gte)).lt("created_at", toISO(lt));
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = Array.isArray(data)
      ? data.map((row) => ({
        ...row,
        counts:
          row?.counts && typeof row.counts === "object"
            ? row.counts
            : null,
      }))
      : [];

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
