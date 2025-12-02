// app/api/stripe/setup-intent/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 400 });
    }
    // Lazy import to avoid SSR bundling issues when env is missing locally
    const { default: Stripe } = await import("stripe");
    const body = await req.json().catch(() => ({}));
    const { email, name, metadata, order_id } = body || {};

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // apiVersion may be auto; leave undefined if not pinned
    });

    // 1) Versuche möglichst bestehende Customer-ID zu verwenden
    let customerId = null;
    // a) Wenn order_id vorhanden → aus DB lesen
    if (order_id) {
      try {
        const admin = supabaseAdmin();
        const { data: ord } = await admin
          .from("orders")
          .select("stripe_customer_id")
          .eq("id", order_id)
          .maybeSingle();
        if (ord?.stripe_customer_id) customerId = ord.stripe_customer_id;
      } catch {}
    }
    // b) Sonst per E‑Mail nach bestehendem Customer suchen
    if (!customerId && email) {
      try {
        // Prefer Search API
        let found = null;
        if (stripe.customers.search) {
          const res = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "")}'` });
          found = res?.data?.[0] || null;
        } else {
          const res = await stripe.customers.list({ email, limit: 1 });
          found = res?.data?.[0] || null;
        }
        if (found) customerId = found.id;
      } catch {}
    }
    // c) Falls weiterhin keiner → neu anlegen und ggf. im Auftrag vermerken
    if (!customerId && email) {
      try {
        const customer = await stripe.customers.create({ email, name });
        customerId = customer?.id || null;
        if (customerId && order_id) {
          try {
            const admin = supabaseAdmin();
            await admin.from("orders").update({ stripe_customer_id: customerId }).eq("id", order_id);
          } catch {}
        }
      } catch {}
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId || undefined,
      payment_method_types: ["card", "sepa_debit"],
      usage: "off_session",
      metadata: {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        ...(order_id ? { order_id } : {}),
      },
    });

    return NextResponse.json({ client_secret: setupIntent.client_secret, customer_id: setupIntent.customer || null });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Stripe error" }, { status: 400 });
  }
}
