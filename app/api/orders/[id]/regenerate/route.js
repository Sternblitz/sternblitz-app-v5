// app/api/orders/[id]/regenerate/route.js
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { Resend } from "resend";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";

export const dynamic = "force-dynamic";



import { buildPdf } from "@/lib/pdfGenerator";

// ... (imports)

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });

    // require logged-in internal user
    const supabase = await supabaseServerAuth();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData?.user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

    const admin = supabaseAdmin();
    // fetch latest order data
    const { data: order, error } = await admin
      .from("orders")
      .select(
        `id, google_profile, selected_option, counts, company, first_name, last_name, email, phone,
         street, zip, city,
         discount_cents, referral_code, rep_code, team_id, org_id`
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden" }, { status: 404 });

    // build PDF
    const discountCents = Math.max(0, Number(order.discount_cents || 0));
    const finalCents = computeFinal(BASE_PRICE_CENTS, discountCents);
    const promoCode = order.referral_code ? String(order.referral_code).toUpperCase() : null;

    const pdfBytes = await buildPdf(
      {
        googleProfile: order.google_profile,
        selectedOption: order.selected_option,
        company: order.company,
        firstName: order.first_name,
        lastName: order.last_name,
        street: order.street,
        zip: order.zip,
        city: order.city,
        email: order.email,
        phone: order.phone,
        counts: order.counts,
      },
      null, // No signature available in regenerate
      { discountCents, finalCents, promoCode }
    );

    // store to bucket
    const safe = String(order?.first_name || "kunde").trim().replace(/[^a-z0-9_-]+/gi, "_") || "kunde";
    const key = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${order.rep_code || "admin"}/${Date.now()}_${safe}_regen.pdf`;
    const { error: uploadErr } = await admin.storage
      .from("contracts")
      .upload(key, Buffer.from(pdfBytes), { contentType: "application/pdf" });
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 });

    const { data: pub } = admin.storage.from("contracts").getPublicUrl(key);
    const pdfUrl = pub?.publicUrl || null;

    // update order
    const { data: updated, error: updErr } = await admin
      .from("orders")
      .update({ pdf_path: key, pdf_signed_url: pdfUrl })
      .eq("id", id)
      .select("id, pdf_path, pdf_signed_url, email, first_name")
      .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // send email optional
    let sent = false;
    const body = await req.json().catch(() => ({}));
    const sendEmail = Boolean(body?.send_email);
    if (sendEmail && updated?.email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const FROM = process.env.RESEND_FROM || "";
        if (FROM) {
          await resend.emails.send({
            from: FROM,
            to: updated.email,
            subject: "Aktualisierte Auftragsbestätigung – Sternblitz",
            html: `<p>Hallo ${updated.first_name || ''},</p><p>wir haben deine Auftragsbestätigung aktualisiert.</p><p><a href="${pdfUrl}">PDF ansehen</a></p>`,
          });
          sent = true;
        }
      } catch { }
    }

    return NextResponse.json({ ok: true, pdfUrl, pdfPath: key, emailed: sent });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
