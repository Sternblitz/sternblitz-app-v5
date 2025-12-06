import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { BASE_PRICE_CENTS, formatEUR } from "@/lib/pricing";
import fs from "fs";
import path from "path";

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
    const { height, width } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (txt, opts) => page.drawText(toWinAnsi(txt), opts);

    // Colors
    const primaryColor = rgb(0, 0.2, 0.6); // Dark Blue
    const grayColor = rgb(0.4, 0.4, 0.4);
    const blackColor = rgb(0, 0, 0);

    const discountCents = Number(priceInfo.discountCents || 0);
    const finalCents = Number(priceInfo.finalCents || (BASE_PRICE_CENTS - discountCents));
    const pricePromoCode = priceInfo.promoCode ? String(priceInfo.promoCode).toUpperCase() : null;
    const priceLine = discountCents > 0
        ? `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} -> ${fmtEUR(finalCents)}${pricePromoCode ? ` (Promo ${pricePromoCode})` : " (Promo aktiv)"}`
        : `Fixpreis: ${fmtEUR(BASE_PRICE_CENTS)} (einmalig)`;

    let y = height - 60;

    // Header with Logo
    try {
        const logoPath = path.join(process.cwd(), "public", "logo_full.png");
        if (fs.existsSync(logoPath)) {
            const logoBytes = fs.readFileSync(logoPath);
            const logoImage = await pdf.embedPng(logoBytes);
            // Scale logic: fit within width 200, height 60
            const maxWidth = 200;
            const maxHeight = 60;
            let dims = logoImage.scale(0.25); // Initial guess
            if (dims.width > maxWidth) dims = logoImage.scale(maxWidth / logoImage.width);
            if (dims.height > maxHeight) dims = logoImage.scale(maxHeight / logoImage.height);

            page.drawImage(logoImage, {
                x: 50,
                y: y - dims.height + 10,
                width: dims.width,
                height: dims.height,
            });
        } else {
            draw("Sternblitz", { x: 50, y, font: bold, size: 24, color: primaryColor });
        }
    } catch (e) {
        console.warn("Logo embed failed", e);
        draw("Sternblitz", { x: 50, y, font: bold, size: 24, color: primaryColor });
    }

    // Date right aligned
    const dateStr = new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    const dateWidth = font.widthOfTextAtSize(dateStr, 10);
    draw(dateStr, { x: width - 50 - dateWidth, y: y, font, size: 10, color: grayColor });

    // Divider
    y -= 40;
    page.drawLine({
        start: { x: 50, y },
        end: { x: width - 50, y },
        thickness: 1,
        color: rgb(0.9, 0.9, 0.9),
    });

    y -= 40;
    draw("Auftragsbestätigung", { x: 50, y, font: bold, size: 18, color: blackColor });
    y -= 20;
    draw("Hiermit bestätige ich den Auftrag zur Löschung meiner negativen Google-Bewertungen.", { x: 50, y, font, size: 11, color: blackColor });

    y -= 25;
    const bullets = [
        priceLine,
        "Zahlung erst nach Löschung (von mind. 90 % der Bewertungen)",
        "Dauerhafte Entfernung",
    ];

    for (const b of bullets) {
        page.drawCircle({ x: 55, y: y + 4, size: 2, color: primaryColor });
        draw(b, { x: 65, y, font, size: 11, color: blackColor });
        y -= 18;
    }

    y -= 20;
    // Box Background for Summary
    // Calculate box height dynamically or make it large enough
    const boxTop = y;
    const boxHeight = 150; // Reduced height to save space
    page.drawRectangle({
        x: 50,
        y: boxTop - boxHeight,
        width: width - 100,
        height: boxHeight,
        color: rgb(0.97, 0.98, 1), // Very light blue
        borderColor: rgb(0.9, 0.9, 0.95),
        borderWidth: 1,
    });

    y -= 25;
    draw("Zusammenfassung", { x: 70, y, font: bold, size: 12, color: primaryColor });
    y -= 20;

    const lines = [
        ["Preis", discountCents > 0
            ? `${fmtEUR(BASE_PRICE_CENTS)} -> ${fmtEUR(finalCents)}${pricePromoCode ? ` (Promo ${pricePromoCode})` : ""}`
            : `${fmtEUR(BASE_PRICE_CENTS)} (einmalig)`],
        ...(pricePromoCode ? [["Promo-Code", `angewendet: ${pricePromoCode}`]] : []),
        ["Google-Profil", p.googleProfile],
        ["Bewertungen", labelFor(p.selectedOption)],
    ];

    for (const [k, v] of lines) {
        draw(`${k}:`, { x: 70, y, font: bold, size: 10, color: rgb(0.3, 0.3, 0.3) });
        // Wrap text if too long
        const valueText = String(v ?? "—");
        const maxWidth = width - 270; // Available width
        if (font.widthOfTextAtSize(valueText, 10) > maxWidth) {
            // Simple truncation for now, or could wrap
            draw(valueText.substring(0, 60) + "...", { x: 200, y, font, size: 10, color: blackColor });
        } else {
            draw(valueText, { x: 200, y, font, size: 10, color: blackColor });
        }
        y -= 18; // Increased spacing
    }

    // Move below box
    y = boxTop - boxHeight - 25; // Reduced gap

    draw("Auftraggeber / Rechnungsadresse", { x: 50, y, font: bold, size: 12, color: blackColor });
    y -= 8;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 20;

    const addressLines = [
        `Firma: ${p.company || "—"}`,
        `Name: ${p.firstName} ${p.lastName}`,
        `Straße: ${p.street || "—"}`,
        `Ort: ${(p.zip || "") + " " + (p.city || "")}`,
        `E-Mail: ${p.email}`,
        `Telefon: ${p.phone}`,
    ];

    // Two column layout for address
    let ay = y;
    for (let i = 0; i < addressLines.length; i++) {
        draw(addressLines[i], { x: i < 3 ? 50 : 300, y: ay, font, size: 10, color: blackColor });
        if (i === 2) ay = y; // Reset y for second column
        else ay -= 18; // Increased spacing
    }
    y = ay - 15; // Update y to below address block

    const picked = chosenCount(p.selectedOption, p.counts);
    y -= 15; // Reduced gap
    draw("Gewählte Löschung:", { x: 50, y, font: bold, size: 10, color: blackColor });
    draw(
        `${labelFor(p.selectedOption)}${picked != null ? ` — Entfernte: ${Number(picked).toLocaleString("de-DE")}` : ""}`,
        { x: 180, y, font, size: 10, color: blackColor }
    );
    y -= 18;

    if (p.counts) {
        const c123 = Number(p.counts.c123 ?? 0).toLocaleString("de-DE");
        const c12 = Number(p.counts.c12 ?? 0).toLocaleString("de-DE");
        const c1 = Number(p.counts.c1 ?? 0).toLocaleString("de-DE");
        draw("Zähler gesamt:", { x: 50, y, font: bold, size: 10, color: blackColor });
        draw(`1–3: ${c123}   |   1–2: ${c12}   |   1: ${c1}`, { x: 180, y, font, size: 10, color: blackColor });
        y -= 18;
    }

    // Legal Block
    y -= 20; // Reduced gap
    page.drawRectangle({
        x: 50,
        y: y - 50,
        width: width - 100,
        height: 60, // Increased height
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.9, 0.9, 0.9),
        borderWidth: 0.5,
    });

    y -= 15;
    draw("Rechtlicher Hinweis:", { x: 60, y, font: bold, size: 9, color: grayColor });
    y -= 14;
    draw(
        "Mit meiner Unterschrift bestätige ich, die AGB und die Datenschutzerklärung gelesen und akzeptiert zu haben.",
        { x: 60, y, font, size: 9, color: grayColor }
    );
    y -= 14;
    draw(
        "Hinweis: Beide Dokumente sind der Bestätigungs-E-Mail als AGB.pdf und Datenschutzbestimmungen.pdf angehängt.",
        { x: 60, y, font, size: 9, color: grayColor }
    );

    // Signature
    y -= 30; // Move label up slightly more
    draw("Unterschrift:", { x: 50, y, font: bold, size: 11, color: blackColor });

    if (sigBytes?.length) {
        const png = await pdf.embedPng(sigBytes);
        // Tighter signature image
        page.drawImage(png, { x: 50, y: y - 55, width: 140, height: 55 });
    }

    y -= 60; // Reduced gap to date
    draw(`Datum: ${new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "medium" })}`, { x: 50, y, font, size: 10, color: blackColor });

    // Footer
    const footerY = 30;
    page.drawLine({ start: { x: 50, y: footerY + 15 }, end: { x: width - 50, y: footerY + 15 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    draw("Sternblitz Auftragsservice · sternblitz.de · info@sternblitz.de", { x: 50, y: footerY, font, size: 8, color: grayColor });
    draw("Seite 1 von 1", { x: width - 100, y: footerY, font, size: 8, color: grayColor });

    return await pdf.save();
}
