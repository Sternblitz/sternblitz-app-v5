// app/api/sign/submit/route.js
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const runtime = "nodejs"; // Node, nicht Edge

const fmtEUR = formatEUR;

// ---------- Helpers ----------
function dataUrlToUint8(signaturePng) {
  const base64 = (signaturePng || "").split(",").pop() || "";
  const bin = Buffer.from(base64, "base64");
  return new Uint8Array(bin);
}

// WinAnsi: Emojis entfernen
function toWinAnsi(text = "") {
  let s = String(text);
  // Remove emoji and miscellaneous symbols
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, "");
  // Replace common unsupported punctuation with ASCII fallbacks
  s = s
    .replace(/\u2192/g, "->")  // right arrow →
    .replace(/\u2190/g, "<-")  // left arrow ←
    .replace(/[\u2013\u2014]/g, "-") // en/em dash – —
    .replace(/\u2022/g, "-")   // bullet •
    .replace(/\u2026/g, "...") // ellipsis …
    .replace(/\u2011/g, "-")   // non-breaking hyphen ‑
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ") // non-breaking / thin spaces
    .replace(/[\u2605\u2728]/g, "*"); // stars to *
  return s;
}

function labelFor(opt) {
  return opt === "123" ? "1–3 Sterne löschen"
    : opt === "12" ? "1–2 Sterne löschen"
      : opt === "1" ? "1 Stern löschen"
        : "Individuelle Löschungen";
}

function chosenCount(selectedOption, counts) {
  if (!counts) return null;
  if (selectedOption === "123") return counts.c123 ?? null;
  if (selectedOption === "12") return counts.c12 ?? null;
  if (selectedOption === "1") return counts.c1 ?? null;
  return null;
}

function safeFileBase(name) {
  return (name || "kunde").toString().trim().replace(/[^a-z0-9_-]+/gi, "_") || "kunde";
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

function randomSuffix(len = 3) {
  const raw = crypto.randomBytes(len).toString("base64").replace(/[^a-z0-9]/gi, "");
  return (raw || "xyz").slice(0, len).toUpperCase();
}

function makePromoCode(firstName = "", lastName = "") {
  return referralBase(firstName, lastName);
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

  const base = referralBase(firstName, lastName);
  let candidate = base.length >= 5 ? base : `${base}${randomSuffix(3)}`;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const { data } = await admin
        .from("referral_codes")
        .insert({ code: candidate, referrer_order_id: orderId })
        .select("code")
        .maybeSingle();
      if (data?.code) return data.code;
      return candidate;
    } catch (e) {
      const errText = `${e?.code || e?.message || ""}`;
      if (errText.includes("duplicate") || errText.includes("23505")) {
        candidate = `${base}${randomSuffix(2 + attempt)}`.slice(0, 12);
        continue;
      }
      break;
    }
  }
  return candidate;
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
import { buildPdf } from "@/lib/pdfGenerator";

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
      referralCode = null,
      signLinkToken = null,
      customDiscount = 0,
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
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user || null;
    if (userError) {
      // Wenn Supabase-Session fehlschlägt, trotzdem weiter (öffentlicher Referral-Flow)
      console.warn("sign/submit getUser error (ignoriere für Referral-Flow)", userError);
    }

    let isInternalUser = false;
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, role")
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
      isInternalUser = true; // jeder eingeloggte Nutzer gilt als intern; Rabatt daher gesperrt
      if (source_account_id && source_account_id !== user.id) {
        console.warn("source_account_id does not match session user", {
          source_account_id,
          user_id: user.id,
        });
      }
    }

    const admin = supabaseAdmin();

    // If sign link token is provided (remote signature), validate and capture ownership
    let signLinkMeta = null;
    if (signLinkToken) {
      try {
        const { data: link } = await admin
          .from("sign_links")
          .select("token, created_by, org_id, team_id, rep_code, expires_at, used_at")
          .eq("token", signLinkToken)
          .maybeSingle();
        const nowMs = Date.now();
        const expMs = link?.expires_at ? new Date(link.expires_at).getTime() : 0;
        if (!link || link.used_at || !expMs || expMs < nowMs) {
          return NextResponse.json({ error: "Signierlink ungültig oder abgelaufen." }, { status: 410 });
        }
        signLinkMeta = link;
      } catch (e) {
        console.warn("sign_link lookup failed", e);
        return NextResponse.json({ error: "Signierlink konnte nicht geprüft werden." }, { status: 400 });
      }
    }
    let normalizedReferralCode = (referralCode || "").toString().trim().toUpperCase();
    // Fallback: Promo aus Cookie `sb_ref` lesen, falls im Body nicht gesetzt
    if (!normalizedReferralCode) {
      try {
        const c = cookies();
        const cookieVal = c?.get?.("sb_ref")?.value || null;
        if (cookieVal) normalizedReferralCode = String(cookieVal).trim().toUpperCase();
      } catch { }
    }
    // Interne Nutzer: niemals Promo anwenden
    if (isInternalUser) normalizedReferralCode = "";
    let referralMatch = null;
    let appliedDiscount = 0;
    const customDiscountCents = Number(customDiscount || 0);

    if (customDiscountCents > 0) {
      appliedDiscount = customDiscountCents;
      normalizedReferralCode = "";
    } else if (normalizedReferralCode) {
      try {
        const { data: rc } = await admin
          .from("referral_codes")
          .select("code, referrer_order_id, discount_cents, max_uses, uses_count, active, expires_at")
          .eq("code", normalizedReferralCode)
          .maybeSingle();
        const now = new Date();
        const valid = rc && rc.active && (!rc.expires_at || new Date(rc.expires_at) > now) && rc.uses_count < rc.max_uses;
        if (valid) {
          referralMatch = rc;
          appliedDiscount = Math.max(0, Number(rc.discount_cents || 0));
        } else {
          // Fallback: generischer Promo-Rabatt, wenn ein Code angegeben wurde
          appliedDiscount = Math.max(0, Number(process.env.DEFAULT_REFERRAL_DISCOUNT_CENTS || 2500));
        }
      } catch (err) {
        console.warn("referral lookup failed", err);
        // Fallback: generischer Promo-Rabatt auch bei Lookup-Fehler
        appliedDiscount = Math.max(0, Number(process.env.DEFAULT_REFERRAL_DISCOUNT_CENTS || 2500));
      }
    }

    // 1) PDF bauen
    const sigBytes = dataUrlToUint8(signaturePng);
    const finalPriceCents = computeFinal(BASE_PRICE_CENTS, appliedDiscount);
    const usedPromoCode = referralMatch?.code || (normalizedReferralCode || null);
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
      sigBytes,
      { discountCents: appliedDiscount, finalCents: finalPriceCents, promoCode: usedPromoCode }
    );

    // 2) Upload zu Supabase Storage (Bucket: contracts)
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
      total_cents: BASE_PRICE_CENTS,
    };

    if (!isInternalUser && appliedDiscount > 0) {
      // markiere Bestellung als Referral auch im Fallback
      orderPayload.referral_channel = "referral";
      orderPayload.referral_code = usedPromoCode;
      if (referralMatch?.referrer_order_id) {
        orderPayload.referral_referrer_order_id = referralMatch.referrer_order_id;
      }
      orderPayload.discount_cents = appliedDiscount;
      orderPayload.total_cents = finalPriceCents;
    }

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

    // Wenn eingeloggt: reguläre RLS-Insert. Sonst: Admin-Insert (service_role) mit Org/Team aus Referral ableiten.
    if (!user && referralMatch?.referrer_order_id) {
      try {
        const { data: refOrg } = await admin
          .from("orders")
          .select("org_id, team_id")
          .eq("id", referralMatch.referrer_order_id)
          .maybeSingle();
        if (refOrg?.org_id && !orderPayload.org_id) orderPayload.org_id = refOrg.org_id;
        if (refOrg?.team_id && !orderPayload.team_id) orderPayload.team_id = refOrg.team_id;
      } catch { }
    }
    if (!user && !orderPayload.org_id) {
      const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || process.env.NEXT_PUBLIC_DEFAULT_ORG_ID || null;
      if (DEFAULT_ORG_ID) orderPayload.org_id = DEFAULT_ORG_ID;
    }

    let insertedOrder = null, insertError = null;
    // Ownership override when sign link is used (customer is not logged in)
    if (signLinkMeta) {
      try {
        if (signLinkMeta.created_by) {
          // assign order to the rep who created the link
          orderPayload.created_by = signLinkMeta.created_by;
          orderPayload.source_account_id = signLinkMeta.created_by;
        }
        if (signLinkMeta.org_id) orderPayload.org_id = signLinkMeta.org_id;
        if (signLinkMeta.team_id) orderPayload.team_id = signLinkMeta.team_id;
        if (!orderPayload.rep_code && signLinkMeta.rep_code) orderPayload.rep_code = signLinkMeta.rep_code;
      } catch { }
    }
    if (user) {
      const { data, error } = await supabase
        .from("orders")
        .insert([orderPayload])
        .select("id, created_at")
        .maybeSingle();
      insertedOrder = data; insertError = error;
    } else {
      const { data, error } = await admin
        .from("orders")
        .insert([orderPayload])
        .select("id, created_at")
        .maybeSingle();
      insertedOrder = data; insertError = error;
    }

    if (insertError) {
      console.error("orders insert failed", insertError);
      try {
        await admin.storage.from("contracts").remove([key]);
      } catch (cleanupErr) {
        console.warn("orders insert cleanup failed", cleanupErr);
      }
      return NextResponse.json({ error: "Auftrag konnte nicht gespeichert werden." }, { status: 500 });
    }

    if (signLinkMeta && insertedOrder?.id) {
      try {
        await admin
          .from("sign_links")
          .update({ used_at: new Date().toISOString() })
          .eq("token", signLinkToken);
      } catch (e) {
        console.warn("sign_link mark used failed", e);
      }
    }

    if (!isInternalUser && referralMatch) {
      try {
        await admin
          .from("referral_codes")
          .update({ uses_count: (referralMatch?.uses_count || 0) + 1 })
          .eq("code", referralMatch.code);
      } catch (err) {
        console.warn("referral uses_count update failed", err);
      }
    }

    const shareCode = await ensureReferralCode(admin, insertedOrder.id, firstName, lastName);

    // 4) E-Mail via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.RESEND_FROM || "";
    const REPLY_TO = process.env.RESEND_REPLY_TO || "";
    const ATTACH = String(process.env.EMAIL_ATTACH_PDF || "").toLowerCase() === "true";

    const subject = "Deine Auftragsbestätigung – Sternblitz";

    const chosenLabel = labelFor(selectedOption);
    const selectedCount = Number(chosenCount(selectedOption, counts) ?? 0);
    const promo = shareCode || makePromoCode(firstName, lastName);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sternblitz.de";
    // Referral-Fluss: dedizierte Seite /empfehlen mit Eingabefeld für Code
    const referralLink = `${appUrl.replace(/\/$/, "")}/empfehlen?mine=1&ref=${encodeURIComponent(promo)}`;
    const pdfLine = ATTACH
      ? "Deine Auftragsbestätigung (PDF) findest du im Anhang."
      : "Deine Auftragsbestätigung (PDF) wurde erstellt.";

    const priceHtml = appliedDiscount
      ? `
          <div style="border:1px solid #bbf7d0;border-radius:14px;padding:14px 16px;margin:12px 0;background:#f0fdf4">
            <div style="font-size:12px;color:#047857;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Fixpreis</div>
            <div style="font-weight:800;color:#065f46">${fmtEUR(BASE_PRICE_CENTS)} → ${fmtEUR(finalPriceCents)}${usedPromoCode ? ` (Promo ${usedPromoCode})` : ""}</div>
            ${usedPromoCode ? `<div style="font-size:12px;color:#065f46;margin-top:4px">Promo‑Code angewendet: <strong>${usedPromoCode}</strong></div>` : ""}
          </div>
        `
      : `
          ${appliedDiscount && usedPromoCode ? `<div style="display:inline-flex;align-items:center;gap:8px;border:1px solid #bbf7d0;background:#f0fdf4;color:#065f46;border-radius:999px;padding:6px 10px;font-weight:800;margin:4px 0 10px">🎉 Promo‑Code angewendet: ${usedPromoCode}</div>` : ''}

          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:12px 0;background:#ffffff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Fixpreis</div>
            <div style="font-weight:700">${fmtEUR(BASE_PRICE_CENTS)} (einmalig)</div>
          </div>
        `;

    const priceText = appliedDiscount
      ? `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} → ${fmtEUR(finalPriceCents)}${usedPromoCode ? ` (Promo ${usedPromoCode})` : ""}`
      : `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} (einmalig)`;

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

          ${priceHtml}

          <p style="margin:16px 0">${pdfLine}</p>

          <div style="margin:26px 0 10px;font-weight:800;font-size:16px">Freunde werben & sparen</div>
          <p style="margin:0 0 12px">
            Teile Sternblitz mit Freunden – <strong>sie sparen 25&nbsp;€</strong> auf die Auftragspauschale
            und du erhältst für jede erfolgreiche Empfehlung einen <strong>25&nbsp;€ Amazon-Gutschein</strong>.
          </p>

          <div style="display:inline-block;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#f7fafc;margin-bottom:10px">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Dein Promocode</div>
            <div style="font-size:20px;font-weight:900;letter-spacing:.6px">${promo}</div>
            <div style="font-size:12px;color:#64748b">Gültig 30 Tage · max. 5 Einlösungen</div>
          </div>

          <div style="margin:6px 0 22px;font-size:14px">
            Teilen-Link:
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
      `Auswahl: ${chosenLabel} → ${Number.isFinite(selectedCount) ? selectedCount : "—"} Stück\n` +
      `${appliedDiscount && usedPromoCode ? `Promo-Code angewendet: ${usedPromoCode}\n` : ''}` +
      `${priceText}\n\n` +
      `${pdfLine}\n\n` +
      `Freunde werben & sparen:\n` +
      `• Deine Freunde sparen 25 € auf die Auftragspauschale\n` +
      `• Du erhältst pro erfolgreicher Empfehlung einen 25 € Amazon-Gutschein\n` +
      `Promocode: ${promo} (30 Tage gültig, max. 5 Einlösungen)\n` +
      `Teilen-Link: ${referralLink}\n\n` +
      `(Dies ist eine automatische Mail)\n\n` +
      `Sternblitz Auftragsservice\n` +
      `info@sternblitz.de · sternblitz.de\n`;

    if (process.env.RESEND_API_KEY && isValidFromOrReplyTo(process.env.RESEND_FROM || "")) {
      if (email) {
        // Build attachments: contract PDF (optional) + legal PDFs (AGB, Datenschutz)
        const attachments = [];
        if (ATTACH) {
          attachments.push({
            filename: fileName,
            content: Buffer.from(pdfBytes),
            contentType: "application/pdf",
          });
        }
        // Try to attach AGB and Datenschutz as requested
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

        const payload = {
          from: process.env.RESEND_FROM,
          to: email,
          subject,
          html,
          text,
          headers: { "X-Entity-Ref-ID": key },
          ...(isValidFromOrReplyTo(process.env.RESEND_REPLY_TO || "") ? { reply_to: process.env.RESEND_REPLY_TO } : {}),
          ...(attachments.length ? { attachments } : {}),
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
      referralCode: promo,
      discountCents: appliedDiscount,
    });
  } catch (e) {
    console.error("sign/submit error:", e);
    return NextResponse.json({ error: e?.message || "Fehler" }, { status: 500 });
  }
}
