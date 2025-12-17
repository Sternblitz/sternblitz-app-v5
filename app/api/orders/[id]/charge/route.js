// app/api/orders/[id]/charge/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Stripe from "stripe";
import { BASE_PRICE_CENTS, computeFinal } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req, { params }) {
  try {
    const { id: orderId } = await params;
    if (!orderId) return NextResponse.json({ error: "orderId fehlt" }, { status: 400 });

    // auth: only ADMIN can charge
    const supabase = await supabaseServerAuth();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
    if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "Nur Admin darf abbuchen" }, { status: 403 });

    // load order via admin client (bypass RLS for server action)
    const admin = supabaseAdmin();
    const { data: order, error: getErr } = await admin
      .from("orders")
      .select("id, email, stripe_customer_id, stripe_payment_method_id, payment_method_type, payment_status, referral_code, discount_cents, total_cents")
      .eq("id", orderId)
      .maybeSingle();
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 400 });
    if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden" }, { status: 404 });

    if (!order.stripe_customer_id || !order.stripe_payment_method_id) {
      return NextResponse.json({ error: "Kein Zahlungsmittel hinterlegt" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const base = BASE_PRICE_CENTS;
    const discount = Math.max(0, Number(order?.discount_cents || 0));
    const defaultAmount = computeFinal(base, discount);
    const amount = Number.isFinite(Number(order?.total_cents)) && Number(order.total_cents) > 0
      ? Number(order.total_cents)
      : defaultAmount;
    const currency = "eur";

    // ensure allowed payment_method_types match the saved method
    let methodType = order.payment_method_type || null;
    try {
      const pm = await stripe.paymentMethods.retrieve(order.stripe_payment_method_id);
      if (pm?.type) methodType = pm.type;
    } catch { }
    const normalizedType = methodType ? String(methodType).toLowerCase() : null;
    const chargeParams = {
      amount,
      currency,
      customer: order.stripe_customer_id,
      payment_method: order.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      receipt_email: order.email || undefined,
      metadata: { order_id: orderId, referral_code: order.referral_code || undefined },
    };
    if (normalizedType) {
      chargeParams.payment_method_types = normalizedType === "sepa_debit"
        ? ["sepa_debit", "card"]
        : ["card", "sepa_debit"];
    } else {
      chargeParams.automatic_payment_methods = { enabled: true };
    }
    const pi = await stripe.paymentIntents.create(chargeParams);

    // update order status accordingly
    const update = {
      stripe_payment_intent_id: pi.id,
      payment_last_event: pi.status,
      charged_amount: pi.amount || null,
      charge_currency: pi.currency || null,
    };
    if (pi.status === "succeeded") {
      update.payment_status = "paid";
      update.charged_at = new Date().toISOString();
      try {
        const url = pi.charges?.data?.[0]?.receipt_url || null;
        if (url) update.payment_receipt_url = url;
      } catch { }
    } else if (pi.status === "processing") {
      update.payment_status = "processing"; // SEPA, etc.
    }

    const { data: updated, error: updErr } = await admin
      .from("orders")
      .update(update)
      .eq("id", orderId)
      .select("id, payment_status, payment_last_event, charged_amount, charge_currency, payment_receipt_url")
      .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, payment_intent: { id: pi.id, status: pi.status }, order: updated });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Charge error" }, { status: 400 });
  }
}
