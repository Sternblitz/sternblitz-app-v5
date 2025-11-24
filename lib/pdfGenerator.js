import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { BASE_PRICE_CENTS, formatEUR } from "@/lib/pricing";

const fmtEUR = formatEUR;

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

export async function buildPdf(p, sigBytes, priceInfo = {}) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const { height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (txt, opts) => page.drawText(toWinAnsi(txt), opts);

    const discountCents = Number(priceInfo.discountCents || 0);
    const finalCents = Number(priceInfo.finalCents || (BASE_PRICE_CENTS - discountCents));
    const pricePromoCode = priceInfo.promoCode ? String(priceInfo.promoCode).toUpperCase() : null;
    const priceLine = discountCents > 0
        ? `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} → ${fmtEUR(finalCents)}${pricePromoCode ? ` (Promo ${pricePromoCode})` : " (Promo aktiv)"}`
        : `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} (einmalig)`;

    let y = height - 70;
    draw("Auftragsbestätigung Sternblitz", { x: 50, y, font: bold, size: 20, color: rgb(0, 0, 0) });

    y -= 20;
    draw("Hiermit bestätige ich den Auftrag zur Löschung meiner negativen Google-Bewertungen.", { x: 50, y, font, size: 11, color: rgb(0, 0, 0) });

    y -= 25;
    for (const b of [
        priceLine,
        "Zahlung erst nach Löschung (von mind. 90 % der Bewertungen)",
        "Dauerhafte Entfernung",
    ]) {
        draw("• " + b, { x: 50, y, font, size: 11, color: rgb(0, 0, 0) });
        y -= 16;
    }

    y -= 10;
    draw("Zusammenfassung", { x: 50, y, font: bold, size: 12, color: rgb(0, 0, 0) });
    y -= 16;

    const lines = [
        ["Preis", discountCents > 0
            ? `${fmtEUR(BASE_PRICE_CENTS)} → ${fmtEUR(finalCents)}${pricePromoCode ? ` (Promo ${pricePromoCode})` : ""}`
            : `${fmtEUR(BASE_PRICE_CENTS)} (einmalig)`],
        ...(pricePromoCode ? [["Promo‑Code", `angewendet: ${pricePromoCode}`]] : []),
        ["Google-Profil", p.googleProfile],
        ["Bewertungen", labelFor(p.selectedOption)],
        ["Firma", p.company],
        ["Vorname", p.firstName],
        ["Nachname", p.lastName],
        ["E-Mail", p.email],
        ["Telefon", p.phone],
    ];
    for (const [k, v] of lines) {
        draw(`${k}:`, { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
        draw(String(v ?? "—"), { x: 180, y, font, size: 10, color: rgb(0, 0, 0) });
        y -= 14;
    }

    const picked = chosenCount(p.selectedOption, p.counts);
    y -= 6;
    draw("Gewählte Löschung:", { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
    draw(
        `${labelFor(p.selectedOption)}${picked != null ? ` — Entfernte: ${Number(picked).toLocaleString("de-DE")}` : ""}`,
        { x: 180, y, font, size: 10, color: rgb(0, 0, 0) }
    );
    y -= 14;

    if (p.counts) {
        const c123 = Number(p.counts.c123 ?? 0).toLocaleString("de-DE");
        const c12 = Number(p.counts.c12 ?? 0).toLocaleString("de-DE");
        const c1 = Number(p.counts.c1 ?? 0).toLocaleString("de-DE");
        draw("Zähler gesamt:", { x: 50, y, font: bold, size: 10, color: rgb(0, 0, 0) });
        draw(`1–3: ${c123}   |   1–2: ${c12}   |   1: ${c1}`, { x: 180, y, font, size: 10, color: rgb(0, 0, 0) });
        y -= 14;
    }

    // Rechtlicher Hinweis (über der Unterschrift)
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

    y -= 12;
    draw("Unterschrift:", { x: 50, y, font: bold, size: 11, color: rgb(0, 0, 0) });
    y -= 100;

    if (sigBytes?.length) {
        const png = await pdf.embedPng(sigBytes);
        page.drawImage(png, { x: 50, y, width: 200, height: 100 });
    }

    y -= 20;
    draw(`Datum: ${new Date().toLocaleString("de-DE")}`, { x: 50, y, font, size: 10, color: rgb(0, 0, 0) });

    return await pdf.save();
}
