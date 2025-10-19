// app/api/sign/submit/route.js
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const runtime = "nodejs"; // Node, nicht Edge

// ---------- Helpers ----------
function dataUrlToUint8(signaturePng) {
  const base64 = (signaturePng || "").split(",").pop() || "";
  const bin = Buffer.from(base64, "base64");
  return new Uint8Array(bin);
}

// WinAnsi: Emojis entfernen
function toWinAnsi(text = "") {
  return String(text).replace(
    /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}]/gu,
    ""
  );
}

function labelFor(opt) {
  return opt === "123" ? "1–3 Sterne löschen"
       : opt === "12"  ? "1–2 Sterne löschen"
       : opt === "1"   ? "1 Stern löschen"
       : "Individuelle Löschungen";
}

function chosenCount(selectedOption, counts) {
  if (!counts) return null;
  if (selectedOption === "123") return counts.c123 ?? null;
  if (selectedOption === "12")  return counts.c12  ?? null;
  if (selectedOption === "1")   return counts.c1   ?? null;
  return null;
}

function safeFileBase(name) {
  return (name || "kunde").toString().trim().replace(/[^a-z0-9_-]+/gi, "_") || "kunde";
}

function makePromoCode(firstName = "", lastName = "") {
  const fn = (firstName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ln = (lastName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const firstL = ln.slice(0, 1);
  const lastL = ln.slice(-1);
  return `${fn}${firstL}${lastL}25`;
}

function isValidFromOrReplyTo(s = "") {
  return (
    /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(s) ||
    /^[^<>]+<[^<>\s@]+@[^<>\s@]+\.[^<>]+>$/.test(s)
  );
}

function storageKeyFor(fileName, repCode) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const folder = repCode ? `${yyyy}/${mm}/${repCode}` : `${yyyy}/${mm}`;
  return `${folder}/${fileName}`;
}

function sanitizeCounts(raw) {
  if (!raw || typeof raw !== "object") return null;
  const keys = ["c123", "c12", "c1"];
  const cleaned = {};
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) cleaned[key] = value;
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeBreakdown(raw) {
  if (!raw || typeof raw !== "object") return {};
  const normalized = {};
  [1, 2, 3, 4, 5].forEach((star) => {
    const val = Number(raw[star]);
    if (Number.isFinite(val)) normalized[star] = val;
  });
  return normalized;
}

function sanitizeStats(stats) {
  if (!stats || typeof stats !== "object") return null;
  const total = Number(stats.totalReviews);
  const average = Number(stats.averageRating);
  const breakdown = normalizeBreakdown(stats.breakdown);
  return {
    totalReviews: Number.isFinite(total) ? total : null,
    averageRating: Number.isFinite(average) ? average : null,
    breakdown,
  };
}

// ---------- PDF ----------
async function buildPdf(p, sigBytes) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw = (txt, opts) => page.drawText(toWinAnsi(txt), opts);

  let y = height - 70;
  draw("Auftragsbestätigung Sternblitz", { x: 50, y, font: bold, size: 20, color: rgb(0,0,0) });

  y -= 20;
  draw("Hiermit bestätige ich den Auftrag zur Löschung meiner negativen Google-Bewertungen.", { x: 50, y, font, size: 11, color: rgb(0,0,0) });

  y -= 25;
  for (const b of [
    "Fixpreis: 299 € (einmalig)",
    "Zahlung erst nach Löschung (von mind. 90 % der Bewertungen)",
    "Dauerhafte Entfernung",
  ]) {
    draw("• " + b, { x: 50, y, font, size: 11, color: rgb(0,0,0) });
    y -= 16;
  }

  y -= 10;
  draw("Zusammenfassung", { x: 50, y, font: bold, size: 12, color: rgb(0,0,0) });
  y -= 16;

  const lines = [
    ["Google-Profil", p.googleProfile],
    ["Bewertungen", labelFor(p.selectedOption)],
    ["Firma", p.company],
    ["Vorname", p.firstName],
    ["Nachname", p.lastName],
    ["E-Mail", p.email],
    ["Telefon", p.phone],
  ];
  for (const [k, v] of lines) {
    draw(`${k}:`, { x: 50, y, font: bold, size: 10, color: rgb(0,0,0) });
    draw(String(v ?? "—"), { x: 180, y, font, size: 10, color: rgb(0,0,0) });
    y -= 14;
  }

  const picked = chosenCount(p.selectedOption, p.counts);
  y -= 6;
  draw("Gewählte Löschung:", { x: 50, y, font: bold, size: 10, color: rgb(0,0,0) });
  draw(
    `${labelFor(p.selectedOption)}${picked != null ? ` — Entfernte: ${Number(picked).toLocaleString("de-DE")}` : ""}`,
    { x: 180, y, font, size: 10, color: rgb(0,0,0) }
  );
  y -= 14;

  if (p.counts) {
    const c123 = Number(p.counts.c123 ?? 0).toLocaleString("de-DE");
    const c12  = Number(p.counts.c12  ?? 0).toLocaleString("de-DE");
    const c1   = Number(p.counts.c1   ?? 0).toLocaleString("de-DE");
    draw("Zähler gesamt:", { x: 50, y, font: bold, size: 10, color: rgb(0,0,0) });
    draw(`1–3: ${c123}   |   1–2: ${c12}   |   1: ${c1}`, { x: 180, y, font, size: 10, color: rgb(0,0,0) });
    y -= 14;
  }

  y -= 12;
  draw("Unterschrift:", { x: 50, y, font: bold, size: 11, color: rgb(0,0,0) });
  y -= 100;

  if (sigBytes?.length) {
    const png = await pdf.embedPng(sigBytes);
    page.drawImage(png, { x: 50, y, width: 200, height: 100 });
  }

  y -= 20;
  draw(`Datum: ${new Date().toLocaleString("de-DE")}`, { x: 50, y, font, size: 10, color: rgb(0,0,0) });

  return await pdf.save();
}

// ---------- Handler ----------
export async function POST(req) {
  try {
    const body = await req.json();
    const {
      googleProfile,
      googleUrl,
      selectedOption,
      company,
      firstName,
      lastName,
      email,
      phone,
      signaturePng,
      counts,                 // { c123, c12, c1 }
      stats,
      statsSource,
      rep_code = null,        // neu: wird mitgespeichert
      source_account_id = null, // neu: wird mitgespeichert
    } = body || {};

    const normalizedGoogleProfile =
      typeof googleProfile === "string" ? googleProfile.trim() : googleProfile;
    const normalizedGoogleUrl = cleanString(googleUrl);
    const statsSnapshot = sanitizeStats(stats);
    const breakdown = statsSnapshot?.breakdown || {};
    const startBad1 = Number.isFinite(breakdown[1]) ? breakdown[1] : null;
    const startBad2 = Number.isFinite(breakdown[2]) ? breakdown[2] : null;
    const startBad3 = Number.isFinite(breakdown[3]) ? breakdown[3] : null;
    const startBadValues = [startBad1, startBad2, startBad3].filter((value) =>
      Number.isFinite(value)
    );
    const startBadSum = startBadValues.length
      ? startBadValues.reduce((sum, value) => sum + value, 0)
      : null;
    const startTotalReviews =
      statsSnapshot && Number.isFinite(statsSnapshot.totalReviews)
        ? statsSnapshot.totalReviews
        : null;
    const startAverageRating =
      statsSnapshot && Number.isFinite(statsSnapshot.averageRating)
        ? statsSnapshot.averageRating
        : null;
    const liveTotalReviews = startTotalReviews;
    const liveAverageRating = startAverageRating;
    const liveBad1 = startBad1;
    const liveBad2 = startBad2;
    const liveBad3 = startBad3;
    const nowIso = new Date().toISOString();

    if (!normalizedGoogleProfile || !signaturePng) {
      return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
    }

    const supabase = supabaseServerAuth();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Session erforderlich." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("sign/submit profile error", profileError);
      return NextResponse.json({ error: "Profil konnte nicht geladen werden." }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json(
        { error: "Kein Profil hinterlegt. Bitte Admin benachrichtigen." },
        { status: 403 }
      );
    }

    if (source_account_id && source_account_id !== user.id) {
      console.warn("source_account_id does not match session user", {
        source_account_id,
        user_id: user.id,
      });
    }

    // 1) PDF bauen
    const sigBytes = dataUrlToUint8(signaturePng);
    const pdfBytes = await buildPdf(
      {
        googleProfile: normalizedGoogleProfile,
        selectedOption,
        company,
        firstName,
        lastName,
        email,
        phone,
        counts,
      },
      sigBytes
    );

    // 2) Upload zu Supabase Storage (Bucket: contracts)
    const admin = supabaseAdmin();
    const safeBase = safeFileBase(firstName);
    const fileName = `${Date.now()}_${safeBase}.pdf`;
    const key = storageKeyFor(fileName, rep_code || undefined);

    const { error: uploadErr } = await admin.storage
      .from("contracts")
      .upload(key, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    const { data: pub } = admin.storage.from("contracts").getPublicUrl(key);
    const pdfUrl = pub?.publicUrl || null;

    // 3) Auftrag speichert sich über das RLS-fähige Client
    const picked = chosenCount(selectedOption, counts);
    let sanitizedCounts = sanitizeCounts(counts) || {};
    const countsFromBreakdown = {};
    if (Number.isFinite(startBad1)) countsFromBreakdown.c1 = startBad1;
    if (Number.isFinite(startBad1) || Number.isFinite(startBad2)) {
      const sum = (Number.isFinite(startBad1) ? startBad1 : 0) + (Number.isFinite(startBad2) ? startBad2 : 0);
      countsFromBreakdown.c12 = sum;
    }
    if (Number.isFinite(startBadSum)) countsFromBreakdown.c123 = startBadSum;
    sanitizedCounts = { ...sanitizedCounts, ...countsFromBreakdown };
    if (!Object.keys(sanitizedCounts).length) sanitizedCounts = null;

    const sourceName = statsSource && typeof statsSource === "object" ? cleanString(statsSource.name) : null;
    const sourceAddress = statsSource && typeof statsSource === "object" ? cleanString(statsSource.address) : null;
    let fallbackName = null;
    let fallbackAddress = null;
    if (typeof normalizedGoogleProfile === "string") {
      const parts = normalizedGoogleProfile.split(",");
      fallbackName = cleanString(parts.shift() || "");
      fallbackAddress = cleanString(parts.join(","));
    }
    const reviewName = sourceName || fallbackName;
    const reviewAddress = sourceAddress || fallbackAddress;

    const orderPayload = {
      google_profile: normalizedGoogleProfile,
      google_url: normalizedGoogleUrl,
      selected_option: cleanString(selectedOption),
      counts: sanitizedCounts,
      company: cleanString(company),
      first_name: cleanString(firstName),
      last_name: cleanString(lastName),
      email: cleanString(email),
      phone: cleanString(phone),
      pdf_path: key,
      pdf_signed_url: pdfUrl,
      start_total_reviews: Number.isFinite(startTotalReviews)
        ? Math.round(startTotalReviews)
        : null,
      start_average_rating: Number.isFinite(startAverageRating)
        ? Number(startAverageRating.toFixed(2))
        : null,
      start_bad_1: Number.isFinite(startBad1) ? Math.round(startBad1) : null,
      start_bad_2: Number.isFinite(startBad2) ? Math.round(startBad2) : null,
      start_bad_3: Number.isFinite(startBad3) ? Math.round(startBad3) : null,
      live_total_reviews: Number.isFinite(liveTotalReviews)
        ? Math.round(liveTotalReviews)
        : null,
      live_average_rating: Number.isFinite(liveAverageRating)
        ? Number(liveAverageRating.toFixed(2))
        : null,
      live_bad_1: Number.isFinite(liveBad1) ? Math.round(liveBad1) : null,
      live_bad_2: Number.isFinite(liveBad2) ? Math.round(liveBad2) : null,
      live_bad_3: Number.isFinite(liveBad3) ? Math.round(liveBad3) : null,
      last_refreshed_at: nowIso,
      review_name: reviewName,
      review_address: reviewAddress,
    };

    if (rep_code && typeof rep_code === "string") {
      const trimmed = rep_code.trim();
      if (trimmed) orderPayload.rep_code = trimmed;
    }
    if (Number.isFinite(picked)) {
      orderPayload.option_chosen_count = picked;
    }
    if (body && typeof body.customNotes !== "undefined") {
      orderPayload.custom_notes = cleanString(body.customNotes);
    }

    const { data: insertedOrder, error: insertError } = await supabase
      .from("orders")
      .insert([orderPayload])
      .select("id, created_at")
      .maybeSingle();

    if (insertError) {
      console.error("orders insert failed", insertError);
      try {
        await admin.storage.from("contracts").remove([key]);
      } catch (cleanupErr) {
        console.warn("orders insert cleanup failed", cleanupErr);
      }
      return NextResponse.json({ error: "Auftrag konnte nicht gespeichert werden." }, { status: 500 });
    }

    // 4) E-Mail via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.RESEND_FROM || "";
    const REPLY_TO = process.env.RESEND_REPLY_TO || "";
    const ATTACH = String(process.env.EMAIL_ATTACH_PDF || "").toLowerCase() === "true";

    const subject = "Deine Auftragsbestätigung – Sternblitz";

    const chosenLabel = labelFor(selectedOption);
    const selectedCount = Number(chosenCount(selectedOption, counts) ?? 0);
    const promo = makePromoCode(firstName, lastName);
    const referralLink = `https://sternblitz.de/empfehlen?ref=DEMO`; // Platzhalter
    const pdfLine = ATTACH
      ? "Deine Auftragsbestätigung (PDF) findest du im Anhang."
      : "Deine Auftragsbestätigung (PDF) wurde erstellt.";

    const html = `
      <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.58;color:#0f172a;background:#ffffff;padding:0;margin:0">
        <div style="max-width:640px;margin:0 auto;padding:28px 20px 8px">
          <h1 style="margin:0 0 10px;font-size:20px;letter-spacing:.2px">Hallo ${firstName || ""}!</h1>
          <p style="margin:0 0 16px">danke für deinen Auftrag. Wir starten jetzt mit der Entfernung der ausgewählten Bewertungen.</p>

          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:18px 0;background:#f9fbff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Google-Profil</div>
            <div style="font-weight:700">${normalizedGoogleProfile ? normalizedGoogleProfile : "—"}</div>
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:12px 0;background:#ffffff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Auswahl</div>
            <div style="font-weight:700">${chosenLabel} → ${Number.isFinite(selectedCount) ? selectedCount : "—"} Stück</div>
          </div>

          <p style="margin:16px 0">${pdfLine}</p>

          <div style="margin:26px 0 10px;font-weight:800;font-size:16px">Freunde werben & sparen</div>
          <p style="margin:0 0 12px">
            Teile Sternblitz mit Freund:innen – <strong>sie sparen 25&nbsp;€</strong> auf die Auftragspauschale
            und du erhältst für jede erfolgreiche Empfehlung einen <strong>25&nbsp;€ Amazon-Gutschein</strong>.
          </p>

          <div style="display:inline-block;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#f7fafc;margin-bottom:10px">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Dein Promocode</div>
            <div style="font-size:20px;font-weight:900;letter-spacing:.6px">${promo}</div>
            <div style="font-size:12px;color:#64748b">Gültig 30 Tage · max. 5 Einlösungen</div>
          </div>

          <div style="margin:6px 0 22px;font-size:14px">
            Teilen-Link (Platzhalter):
            <a href="${referralLink}" target="_blank" rel="noopener" style="color:#0b6cf2;text-decoration:none">${referralLink}</a>
          </div>

          <p style="color:#64748b;font-style:italic;margin-top:6px">(Dies ist eine automatische Mail)</p>
        </div>

        <div style="max-width:640px;margin:0 auto;padding:0 20px 28px">
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0 18px"/>
          <table role="presentation" style="width:100%;border-collapse:collapse">
            <tr><td style="font-weight:900;padding:0 0 6px">Sternblitz Auftragsservice</td></tr>
            <tr><td style="padding:0 0 4px">📧 <a href="mailto:info@sternblitz.de" style="color:#0b6cf2;text-decoration:none">info@sternblitz.de</a></td></tr>
            <tr><td>🌐 <a href="https://sternblitz.de" style="color:#0b6cf2;text-decoration:none">sternblitz.de</a></td></tr>
          </table>
        </div>
      </div>
    `.trim();

    const text =
      `Hallo ${firstName || ""}!\n\n` +
      `Danke für deinen Auftrag. Wir starten jetzt mit der Entfernung der ausgewählten Bewertungen.\n\n` +
      `Google-Profil: ${normalizedGoogleProfile || "—"}\n` +
      `Auswahl: ${chosenLabel} → ${Number.isFinite(selectedCount) ? selectedCount : "—"} Stück\n\n` +
      `${pdfLine}\n\n` +
      `Freunde werben & sparen:\n` +
      `• Deine Freunde sparen 25 € auf die Auftragspauschale\n` +
      `• Du erhältst pro erfolgreicher Empfehlung einen 25 € Amazon-Gutschein\n` +
      `Promocode: ${promo} (30 Tage gültig, max. 5 Einlösungen)\n` +
      `Teilen-Link (Platzhalter): ${referralLink}\n\n` +
      `(Dies ist eine automatische Mail)\n\n` +
      `Sternblitz Auftragsservice\n` +
      `info@sternblitz.de · sternblitz.de\n`;

    if (process.env.RESEND_API_KEY && isValidFromOrReplyTo(process.env.RESEND_FROM || "")) {
      if (email) {
        const payload = {
          from: process.env.RESEND_FROM,
          to: email,
          subject,
          html,
          text,
          headers: { "X-Entity-Ref-ID": key },
          ...(isValidFromOrReplyTo(process.env.RESEND_REPLY_TO || "") ? { reply_to: process.env.RESEND_REPLY_TO } : {}),
          ...(ATTACH ? {
            attachments: [{
              filename: fileName,
              content: Buffer.from(pdfBytes),
              contentType: "application/pdf",
            }],
          } : {}),
        };
        const { error: mailErr } = await resend.emails.send(payload);
        if (mailErr) console.warn("Resend error:", mailErr);
      } else {
        console.warn("Kein Empfänger (email) angegeben – E-Mail übersprungen.");
      }
    } else {
      console.warn("E-Mail nicht gesendet: RESEND_API_KEY/RESEND_FROM fehlt oder ungültig.");
    }

    return NextResponse.json({
      ok: true,
      pdfUrl,
      pdfPath: key,
      orderId: insertedOrder?.id ?? null,
    });
  } catch (e) {
    console.error("sign/submit error:", e);
    return NextResponse.json({ error: e?.message || "Fehler" }, { status: 500 });
  }
}
