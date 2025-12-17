// app/api/seo/submit/route.js
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SEO_DELIVERABLES_TEXT } from "@/lib/seoDeliverables";
import { Resend } from "resend";

export const runtime = "nodejs";

function toWinAnsi(text = "") {
  let s = String(text);
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, "");
  s = s
    .replace(/[\u2010-\u2014\u2212]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...");
  return s;
}
function dataUrlToUint8(signaturePng) {
  const base64 = (signaturePng || "").split(",").pop() || "";
  const bin = Buffer.from(base64, "base64");
  return new Uint8Array(bin);
}

function escapeHtml(input = "") {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text = "", maxWidth = 400, font, size = 10) {
  if (!font) return [String(text || "")];
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  const flush = () => {
    if (current) {
      lines.push(current);
      current = "";
    }
  };
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    flush();
    let chunk = word;
    while (font.widthOfTextAtSize(chunk, size) > maxWidth && chunk.length > 1) {
      let sliceIdx = chunk.length - 1;
      while (sliceIdx > 1 && font.widthOfTextAtSize(chunk.slice(0, sliceIdx), size) > maxWidth) {
        sliceIdx--;
      }
      if (sliceIdx <= 1) break;
      lines.push(chunk.slice(0, sliceIdx));
      chunk = chunk.slice(sliceIdx);
    }
    current = chunk;
  }
  flush();
  return lines.length ? lines : [""];
}

async function buildSeoPdf(p, sigBytes) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw = (txt, opts) => page.drawText(toWinAnsi(txt), opts);
  let y = height - 70;
  draw("Auftragsbestätigung Sternblitz – SEO", { x: 50, y, font: bold, size: 18, color: rgb(0,0,0) });
  y -= 22;
  draw("Hiermit bestätige ich den Auftrag zur SEO‑Optimierung meines Google‑Profils.", { x: 50, y, font, size: 11, color: rgb(0,0,0) });
  y -= 18;
  draw("Im Leistungsumfang enthalten", { x: 50, y, font: bold, size: 12 });
  y -= 14;
  for (const b of SEO_DELIVERABLES_TEXT) {
    const lines = wrapText(b, 420, font, 10);
    lines.forEach((line, idx) => {
      const prefix = idx === 0 ? "• " : "   ";
      draw(prefix + line, { x: 50, y, font, size: 10 });
      y -= 14;
    });
  }
  y -= 8;
  draw("Preis & Kündigung", { x: 50, y, font: bold, size: 12 }); y -= 14;
  draw("Monatlicher Fixpreis: 99 €", { x: 50, y, font, size: 11 }); y -= 14;
  draw("Monatlich kündbar, keine Kündigungsfrist", { x: 50, y, font, size: 11 }); y -= 18;

  draw("Zusammenfassung", { x: 50, y, font: bold, size: 12 }); y -= 14;
  const pairs = [
    ["Google‑Profil", p.googleProfile],
    ["Firma", p.company],
    ["Vorname", p.firstName],
    ["Nachname", p.lastName],
    ["E‑Mail", p.email],
    ["Telefon", p.phone],
  ];
  for (const [k, v] of pairs) {
    draw(`${k}:`, { x: 50, y, font: bold, size: 10 });
    draw(String(v || '—'), { x: 170, y, font, size: 10 });
    y -= 14;
  }
  y -= 8;
  draw("Unterschrift:", { x: 50, y, font: bold, size: 11 }); y -= 100;
  if (sigBytes?.length) { const png = await pdf.embedPng(sigBytes); page.drawImage(png, { x: 50, y, width: 200, height: 100 }); }
  y -= 20;
  draw(`Datum: ${new Date().toLocaleString('de-DE')}`, { x: 50, y, font, size: 10 });
  return await pdf.save();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { googleProfile, googleUrl, company, firstName, lastName, email, phone, signaturePng, rep_code = null, signLinkToken = null } = body || {};
    if (!googleProfile || !signaturePng) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

    const admin = supabaseAdmin();

    const sigBytes = dataUrlToUint8(signaturePng);
    const pdfBytes = await buildSeoPdf({ googleProfile, googleUrl, company, firstName, lastName, email, phone }, sigBytes);

    const safeBase = String(firstName || 'kunde').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'kunde';
    const key = `${new Date().getFullYear()}/${String(new Date().getMonth()+1).padStart(2,'0')}/${rep_code || 'seo'}/${Date.now()}_${safeBase}_seo.pdf`;
    const { error: uploadErr } = await admin.storage.from('contracts').upload(key, Buffer.from(pdfBytes), { contentType: 'application/pdf' });
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 });
    const { data: pub } = admin.storage.from('contracts').getPublicUrl(key);
    const pdfUrl = pub?.publicUrl || null;

    if (signLinkToken) {
      try {
        await admin
          .from('sign_links')
          .update({ used_at: new Date().toISOString() })
          .eq('token', signLinkToken)
          .is('used_at', null);
      } catch {}
    }

    // Emails
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const FROM = process.env.RESEND_FROM;
      const SEO_DOC_URL = "https://iexrsxsfqzxuafhblhhd.supabase.co/storage/v1/object/public/documents/AGB%20Sternblitz-SEO.pdf";
      const ATTACH = String(process.env.EMAIL_ATTACH_PDF || "").toLowerCase() === 'true';
      const attachments = [];
      if (ATTACH && pdfBytes) attachments.push({ filename: `Sternblitz_SEO_${safeBase}.pdf`, content: Buffer.from(pdfBytes), contentType: 'application/pdf' });
      // optional legal attach
      const fetchAttach = async (url, name) => { try { if (!url) return; const r = await fetch(url); if (!r.ok) return; const ab = await r.arrayBuffer(); attachments.push({ filename: name, content: Buffer.from(ab), contentType: 'application/pdf' }); } catch {} };
      await fetchAttach(SEO_DOC_URL, 'Sternblitz_AGB.pdf');

      const deliverablesHtml = SEO_DELIVERABLES_TEXT.map((line) => `<li style="margin:0 0 6px;padding:0">${escapeHtml(line)}</li>`).join("");
      const deliverablesText = SEO_DELIVERABLES_TEXT.map((line) => `- ${line}`).join('\n');
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      const safeFirstNameHtml = escapeHtml(firstName || '');
      const safeFullNameHtml = escapeHtml(fullName || '—');
      const safeCompanyHtml = escapeHtml(company || '—');
      const safeEmailHtml = escapeHtml(email || '—');
      const safePhoneHtml = escapeHtml(phone || '—');
      const safeProfileHtml = escapeHtml(googleProfile || '—');
      const safeUrl = googleUrl ? escapeHtml(googleUrl) : null;
      const summaryRows = [
        ["Google-Profil", safeProfileHtml],
        ["Profil-Link", safeUrl ? `<a href="${safeUrl}" style="color:#0b6cf2;text-decoration:none">Profil öffnen ↗</a>` : "—"],
        ["Firma", safeCompanyHtml],
        ["Ansprechpartner", safeFullNameHtml],
        ["E-Mail", safeEmailHtml],
        ["Telefon", safePhoneHtml],
      ];
      const summaryHtml = summaryRows.map(([label, value]) => `
        <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #eef2ff">
          <div style="min-width:130px;font-weight:600;color:#0f172a">${label}</div>
          <div style="color:#0f172a">${value}</div>
        </div>`).join("");
      const subject = 'Deine SEO‑Auftragsbestätigung – Sternblitz';
      const html = `
        <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.58;color:#0f172a;background:#ffffff;padding:0;margin:0">
          <div style="max-width:640px;margin:0 auto;padding:28px 20px 28px">
            <h1 style="margin:0 0 10px;font-size:20px;letter-spacing:.2px">Hallo ${safeFirstNameHtml}!</h1>
            <p style="margin:0 0 14px">danke für deinen SEO‑Auftrag. Wir starten sofort mit der Optimierung deines Google-Unternehmensprofils.</p>
            <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:0 0 18px;background:#f9fbff">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Preis & Konditionen</div>
              <div style="font-weight:700">Monatlicher Fixpreis 99 €</div>
              <div style="font-size:12px;color:#64748b">Keine Mindestlaufzeit, keine Kündigungsfrist</div>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:0 0 18px;background:#ffffff">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Google-Profil & Kontakt</div>
              ${summaryHtml}
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;background:#ffffff">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Im Leistungsumfang enthalten</div>
              <ul style="margin:0;padding-left:18px;color:#0f172a">${deliverablesHtml}</ul>
            </div>
            ${pdfUrl ? `<p style="margin:18px 0 0"><a href="${pdfUrl}" style="display:inline-block;background:#0b6cf2;color:#fff;font-weight:900;padding:10px 14px;border-radius:999px;text-decoration:none">PDF ansehen</a></p>` : ''}
          </div>
        </div>`;
      const summaryText = [
        `Google-Profil: ${googleProfile || '—'}`,
        googleUrl ? `Profil-Link: ${googleUrl}` : null,
        `Firma: ${company || '—'}`,
        `Ansprechpartner: ${fullName || '—'}`,
        `E-Mail: ${email || '—'}`,
        `Telefon: ${phone || '—'}`,
      ].filter(Boolean).join('\n');
      const text = `Hallo ${firstName || ''}!\n\nDeine SEO‑Auftragsbestätigung ist da. Wir starten sofort mit deinem Google-Profil.\n\n${summaryText}\n\nLeistungen:\n${deliverablesText}\n\nPreis: 99 € pro Monat · keine Mindestlaufzeit.${pdfUrl ? `\nPDF: ${pdfUrl}` : ''}`;
      // Kunde
      if (email) {
        await resend.emails.send({ from: FROM, to: email, subject, html, text, ...(attachments.length ? { attachments } : {}) });
      }
      // Intern
      const OPS = process.env.SEO_NOTIFY_EMAIL || 'kundenauftrag@sternblitz.de';
      await resend.emails.send({ from: FROM, to: OPS, subject: `SEO Auftrag – ${firstName || ''}`, html, text });
    }

    const redirect = process.env.NEXT_PUBLIC_SEO_CHECKOUT_URL || process.env.SEO_CHECKOUT_URL || "https://rechnung.sternblitz.de/b/9B63cwgDd7UP6550kYc3m03";
    return NextResponse.json({ ok: true, redirect });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
