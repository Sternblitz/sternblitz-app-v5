// app/api/orders/[id]/send-confirmation/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { Resend } from "resend";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function labelFor(opt) {
  return opt === "123"
    ? "1–3 Sterne löschen"
    : opt === "12"
      ? "1–2 Sterne löschen"
      : opt === "1"
        ? "1 Stern löschen"
        : "Individuelle Löschungen";
}

function referralBase(firstName = "", lastName = "") {
  const fn = (firstName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ln = (lastName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const firstL = ln.slice(0, 1) || "x";
  const lastL = ln.slice(-1) || "z";
  const base = `${fn.slice(0, 5)}${firstL}${lastL}25`.replace(/[^a-z0-9]/g, "");
  const clean = base || "stern25";
  return clean.toUpperCase();
}

async function ensureReferralCode(admin, orderId, firstName, lastName) {
  if (!orderId) return referralBase(firstName, lastName);
  try {
    const { data: existing } = await admin
      .from("referral_codes")
      .select("code")
      .eq("referrer_order_id", orderId)
      .maybeSingle();
    if (existing?.code) return existing.code;
  } catch { }
  const candidate = referralBase(firstName, lastName);
  try {
    const { data } = await admin
      .from("referral_codes")
      .insert({ code: candidate, referrer_order_id: orderId })
      .select("code")
      .maybeSingle();
    if (data?.code) return data.code;
  } catch { }
  return candidate;
}

export async function POST(req, { params }) {
  try {
    const { id: orderId } = await params;
    if (!orderId) return NextResponse.json({ error: "orderId fehlt" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const toOverride = (body?.to || body?.email || "").trim();

    const supabase = await supabaseServerAuth();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData?.user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select(
        "id, google_profile, selected_option, counts, company, first_name, last_name, email, phone, pdf_signed_url, referral_code, discount_cents, total_cents"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden" }, { status: 404 });

    const recipient = toOverride || order.email || "";
    if (!recipient) return NextResponse.json({ error: "Keine E‑Mail angegeben" }, { status: 400 });
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return NextResponse.json({ error: "Mailversand nicht konfiguriert (RESEND_API_KEY/RESEND_FROM)" }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.RESEND_FROM;
    const ATTACH = String(process.env.EMAIL_ATTACH_PDF || "").toLowerCase() === "true";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sternblitz.de";
    const pdfUrl = order.pdf_signed_url || null;
    const firstName = (order.first_name || "").trim();
    const chosenLabel = labelFor(order.selected_option);
    const discount = Math.max(0, Number(order.discount_cents || 0));
    const finalPriceCents = computeFinal(BASE_PRICE_CENTS, discount);
    const usedPromoCode = (order.referral_code || "").toString().toUpperCase() || null;
    const promo = await ensureReferralCode(admin, order.id, order.first_name, order.last_name);
    const referralLink = `${appUrl.replace(/\/$/, "")}/empfehlen?mine=1&ref=${encodeURIComponent(promo)}`;
    const fmtEUR = formatEUR;

    const priceHtml = discount > 0
      ? `
          <div style="border:1px solid #bbf7d0;border-radius:14px;padding:14px 16px;margin:12px 0;background:#f0fdf4">
            <div style="font-size:12px;color:#047857;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Fixpreis</div>
            <div style="font-weight:800;color:#065f46">${fmtEUR(BASE_PRICE_CENTS)} → ${fmtEUR(finalPriceCents)}${usedPromoCode ? ` (Promo ${usedPromoCode})` : ""}</div>
            ${usedPromoCode ? `<div style=\"font-size:12px;color:#065f46;margin-top:4px\">Promo‑Code angewendet: <strong>${usedPromoCode}</strong></div>` : ""}
          </div>
        `
      : `
          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:12px 0;background:#ffffff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Fixpreis</div>
            <div style="font-weight:700">${fmtEUR(BASE_PRICE_CENTS)} (einmalig)</div>
          </div>
        `;

    const html = `
      <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.58;color:#0f172a;background:#ffffff;padding:0;margin:0">
        <div style="max-width:640px;margin:0 auto;padding:28px 20px 8px">
          <h1 style="margin:0 0 10px;font-size:20px;letter-spacing:.2px">Hallo ${firstName || ''}!</h1>
          <p style="margin:0 0 16px">hier ist deine Auftragsbestätigung.</p>
          ${priceHtml}
          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:18px 0;background:#f9fbff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Google‑Profil</div>
            <div style="font-weight:700">${order.google_profile ? order.google_profile : '—'}</div>
          </div>
          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:12px 0;background:#ffffff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Auswahl</div>
            <div style="font-weight:700">${chosenLabel}</div>
          </div>
          ${pdfUrl ? `<p style="margin:0 0 14px"><a href="${pdfUrl}" style="display:inline-block;background:#0b6cf2;color:#fff;font-weight:900;padding:10px 14px;border-radius:999px;text-decoration:none">PDF ansehen</a></p>` : ''}

          <div style="margin:26px 0 10px;font-weight:800;font-size:16px">Freunde werben & sparen</div>
          <p style="margin:0 0 12px">Teile Sternblitz mit Freunden – <strong>sie sparen 25&nbsp;€</strong> auf die Auftragspauschale und du erhältst für jede erfolgreiche Empfehlung einen <strong>25&nbsp;€ Amazon-Gutschein</strong>.</p>
          <div style="display:inline-block;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#f7fafc;margin-bottom:10px">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Dein Promocode</div>
            <div style="font-size:20px;font-weight:900;letter-spacing:.6px">${promo}</div>
            <div style="font-size:12px;color:#64748b">Gültig 30 Tage · max. 5 Einlösungen</div>
          </div>
          <div style="margin:6px 0 22px;font-size:14px">Teilen-Link: <a href="${referralLink}" target="_blank" rel="noopener" style="color:#0b6cf2;text-decoration:none">${referralLink}</a></div>

          <p style="color:#64748b;font-style:italic;margin-top:6px">(Dies ist eine automatische Mail)</p>
        </div>
      </div>
    `.trim();

    const text =
      `Hallo ${firstName || ""}!\n\n` +
      `Hier ist deine Auftragsbestätigung.\n` +
      `${discount ? `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} → ${fmtEUR(finalPriceCents)}${usedPromoCode ? ` (Promo ${usedPromoCode})` : ''}\n` : `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} (einmalig)\n`}` +
      `Google-Profil: ${order.google_profile || '—'}\n` +
      `Auswahl: ${chosenLabel}\n\n` +
      (pdfUrl ? `PDF: ${pdfUrl}\n\n` : "") +
      `Freunde werben & sparen:\n` +
      `• Deine Freunde sparen 25 € auf die Auftragspauschale\n` +
      `• Du erhältst pro erfolgreicher Empfehlung einen 25 € Amazon-Gutschein\n` +
      `Promocode: ${promo} (30 Tage gültig, max. 5 Einlösungen)\n` +
      `Teilen-Link: ${referralLink}\n`;

    const attachments = [];
    if (ATTACH && pdfUrl) {
      try {
        const r = await fetch(pdfUrl);
        if (r.ok) {
          const ab = await r.arrayBuffer();
          attachments.push({ filename: `Sternblitz_Auftragsbestaetigung_${order.first_name || 'Kunde'}.pdf`, content: Buffer.from(ab), contentType: 'application/pdf' });
        }
      } catch { }
    }
    const AGB_URL = process.env.NEXT_PUBLIC_AGB_URL || process.env.AGB_URL || null;
    const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL || process.env.PRIVACY_URL || null;
    const tryAttachFromUrl = async (url, outName) => {
      if (!url) return;
      try {
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) return;
        const ab = await res.arrayBuffer();
        attachments.push({ filename: outName, content: Buffer.from(ab), contentType: 'application/pdf' });
      } catch { }
    };
    await tryAttachFromUrl(AGB_URL, 'AGB.pdf');
    await tryAttachFromUrl(PRIVACY_URL, 'Datenschutzbestimmungen.pdf');

    const { error: mailErr } = await resend.emails.send({ from: FROM, to: recipient, subject: "Deine Auftragsbestätigung – Sternblitz", html, text, ...(attachments.length ? { attachments } : {}) });
    if (mailErr) return NextResponse.json({ error: mailErr.message || "E‑Mail Versand fehlgeschlagen" }, { status: 500 });
    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
