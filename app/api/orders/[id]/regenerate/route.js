// app/api/orders/[id]/regenerate/route.js
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { Resend } from "resend";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function toWinAnsi(text = "") {
  let s = String(text);
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, "");
  s = s
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2011/g, "-")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .replace(/[\u2605\u2728]/g, "*");
  return s;
}

function labelFor(opt) {
  return opt === "123"
    ? "1–3 Sterne löschen"
    : opt === "12"
      ? "1–2 Sterne löschen"
      : opt === "1"
        ? "1 Stern löschen"
        : "Individuelle Löschungen";
}

function chosenCount(selectedOption, counts) {
  if (!counts) return null;
  if (selectedOption === "123") return counts.c123 ?? null;
  if (selectedOption === "12") return counts.c12 ?? null;
  if (selectedOption === "1") return counts.c1 ?? null;
  return null;
}

async function buildPdf(order) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw = (txt, opts) => page.drawText(toWinAnsi(txt), opts);

  const discountCents = Math.max(0, Number(order?.discount_cents || 0));
  const finalCents = computeFinal(BASE_PRICE_CENTS, discountCents);
  const pricePromoCode = order?.referral_code ? String(order.referral_code).toUpperCase() : null;
  const priceLine =
    discountCents > 0
      ? `Fixpreis: ${formatEUR(BASE_PRICE_CENTS)} -> ${formatEUR(finalCents)}${pricePromoCode ? ` (Promo ${pricePromoCode})` : " (Promo aktiv)"}`
      : `Fixpreis: ${formatEUR(BASE_PRICE_CENTS)} (einmalig)`;

  let y = height - 70;
  draw("Auftragsbestätigung Sternblitz", { x: 50, y, font: bold, size: 20, color: rgb(0, 0, 0) });
  y -= 20;
  draw(
    "Hiermit bestätige ich den Auftrag zur Löschung meiner negativen Google-Bewertungen.",
    { x: 50, y, font, size: 11, color: rgb(0, 0, 0) }
  );
  y -= 25;
  for (const b of [priceLine, "Zahlung erst nach Löschung (von mind. 90 % der Bewertungen)", "Dauerhafte Entfernung"]) {
    draw("• " + b, { x: 50, y, font, size: 11, color: rgb(0, 0, 0) });
    y -= 16;
  }
  y -= 10;
  draw("Zusammenfassung", { x: 50, y, font: bold, size: 12, color: rgb(0, 0, 0) });
  y -= 16;

  const lines = [
    [
      "Preis",
      discountCents > 0
        ? `${formatEUR(BASE_PRICE_CENTS)} -> ${formatEUR(finalCents)}${pricePromoCode ? ` (Promo ${pricePromoCode})` : ""}`
        : `${formatEUR(BASE_PRICE_CENTS)} (einmalig)`,
    ],
    ...(pricePromoCode ? [["Promo‑Code", `angewendet: ${pricePromoCode}`]] : []),
    ["Google-Profil", order?.google_profile || "—"],
    ["Bewertungen", labelFor(order?.selected_option)],
    ["Firma", order?.company || "—"],
    ["Vorname", order?.first_name || "—"],
    ["Nachname", order?.last_name || "—"],
    ["E-Mail", order?.email || "—"],
    ["Telefon", order?.phone || "—"],
  ];
  for (const [k, v] of lines) {
    draw(`${k}:`, { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
    draw(String(v ?? "—"), { x: 180, y, font, size: 10, color: rgb(0, 0, 0) });
    y -= 14;
  }
  const picked = chosenCount(order?.selected_option, order?.counts);
  y -= 6;
  draw("Gewählte Löschung:", { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
  draw(
    `${labelFor(order?.selected_option)}${picked != null ? ` — Entfernte: ${Number(picked).toLocaleString("de-DE")}` : ""}`,
    { x: 180, y, font, size: 10, color: rgb(0, 0, 0) }
  );
  y -= 14;

  // Rechtlicher Hinweis (über der Unterschrift/Datum)
  y -= 8;
  draw("Rechtlicher Hinweis:", { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
  y -= 14;
  draw(
    "Mit meiner Unterschrift bestätige ich, die AGB und die Datenschutzerklärung gelesen und akzeptiert zu haben.",
    { x: 50, y, font, size: 10, color: rgb(0, 0, 0) }
  );
  y -= 14;
  draw(
    "Hinweis: Beide Dokumente sind der Bestätigungs-E-Mail als AGB.pdf und Datenschutzbestimmungen.pdf angehängt.",
    { x: 50, y, font, size: 10, color: rgb(0, 0, 0) }
  );
  y -= 12;

  draw("Datum:", { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
  draw(new Date().toLocaleString("de-DE"), { x: 180, y, font, size: 10, color: rgb(0, 0, 0) });

  return await pdf.save();
}

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
         discount_cents, referral_code, rep_code, team_id, org_id`
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!order) return NextResponse.json({ error: "Auftrag nicht gefunden" }, { status: 404 });

    // build PDF
    const pdfBytes = await buildPdf(order);

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
