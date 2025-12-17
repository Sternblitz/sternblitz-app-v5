// app/api/orders/[id]/billing/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function clean(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t : null;
}

export async function POST(req, { params }) {
  try {
    const { id: orderId } = await params;
    if (!orderId) return NextResponse.json({ error: "orderId fehlt" }, { status: 400 });

    const supabase = await supabaseServerAuth();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user || null;
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
    const role = me?.role || null;

    const admin = supabaseAdmin();
    const { data: ord, error: ordErr } = await admin
      .from("orders")
      .select("id, created_by")
      .eq("id", orderId)
      .maybeSingle();
    if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 400 });
    if (!ord) return NextResponse.json({ error: "Auftrag nicht gefunden" }, { status: 404 });

    if (ord.created_by !== user.id && role !== "ADMIN") {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const patch = {
      billing_name: clean(body?.billing_name),
      billing_company: clean(body?.billing_company),
      billing_email: clean(body?.billing_email),
      billing_line1: clean(body?.billing_line1),
      billing_line2: clean(body?.billing_line2),
      billing_postal_code: clean(body?.billing_postal_code),
      billing_city: clean(body?.billing_city),
      billing_country: clean(body?.billing_country),
      billing_vat_id: clean(body?.billing_vat_id),
    };

    // also sync primary contact fields if provided
    if (typeof body?.email === "string") patch.email = clean(body.email);
    if (typeof body?.first_name === "string") patch.first_name = clean(body.first_name);
    if (typeof body?.last_name === "string") patch.last_name = clean(body.last_name);
    if (typeof body?.company === "string") patch.company = clean(body.company);

    const { data: updated, error: updErr } = await admin
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select("id, billing_name, billing_email, billing_line1, billing_city, billing_postal_code, billing_country, company, first_name, last_name, email")
      .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, order: updated });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

