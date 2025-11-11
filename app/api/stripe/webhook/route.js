// app/api/stripe/webhook/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY" }, { status: 400 });
    }
    const raw = await req.text();
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const event = stripe.webhooks.constructEvent(raw, sig, secret);

    const admin = supabaseAdmin();
    switch (event.type) {
      case "setup_intent.succeeded": {
        const si = event.data.object;
        const orderId = si?.metadata?.order_id || null;
        const paymentMethodId = si?.payment_method || null;
        const customerId = si?.customer || null;
        // Fetch payment method type if possible
        let pmType = null;
        try { pmType = si?.payment_method_types?.[0] || null; } catch {}
        if (orderId && (paymentMethodId || customerId)) {
          await admin
            .from("orders")
            .update({
              stripe_customer_id: customerId,
              stripe_payment_method_id: paymentMethodId,
              stripe_setup_intent_id: si.id,
              payment_method_type: pmType,
              payment_status: "card_on_file",
              payment_last_event: "setup_intent.succeeded",
              payment_last_error: null,
            })
            .eq("id", orderId);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const orderId = pi?.metadata?.order_id || null;
        const update = {
          stripe_payment_intent_id: pi.id,
          payment_last_event: "payment_intent.succeeded",
          payment_status: "paid",
          charged_amount: pi.amount || null,
          charge_currency: pi.currency || null,
          charged_at: new Date().toISOString(),
          payment_last_error: null,
        };
        try { update.payment_receipt_url = pi.charges?.data?.[0]?.receipt_url || null; } catch {}
        if (orderId) {
          // set paid
          await admin.from("orders").update(update).eq("id", orderId);
          // referral bookkeeping: mark award pending and increment uses_count once
          try {
            const { data: ord } = await admin
              .from("orders")
              .select("referral_code, referral_award_status")
              .eq("id", orderId)
              .maybeSingle();
            const code = ord?.referral_code || null;
            if (code && !ord?.referral_award_status) {
              await admin.from("orders").update({ referral_award_status: "pending" }).eq("id", orderId);
              // TODO: optional increment referral_codes.uses_count via DB function if needed
            }
          } catch {}
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const orderId = pi?.metadata?.order_id || null;
        const message = pi?.last_payment_error?.message || "payment_failed";
        if (orderId) {
          await admin
            .from("orders")
            .update({ payment_status: "failed", payment_last_event: "payment_intent.payment_failed", payment_last_error: message })
            .eq("id", orderId);
        }
        break;
      }
      case "payment_intent.processing": {
        const pi = event.data.object;
        const orderId = pi?.metadata?.order_id || null;
        if (orderId) {
          await admin
            .from("orders")
            .update({ payment_status: "processing", payment_last_event: "payment_intent.processing", payment_last_error: null })
            .eq("id", orderId);
        }
        break;
      }
      default:
        break;
    }

    return new NextResponse(null, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Webhook error" }, { status: 400 });
  }
}
