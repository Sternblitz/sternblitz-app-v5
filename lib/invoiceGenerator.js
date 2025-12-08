import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function generateInvoicePdf(invoiceData) {
    const {
        invoiceNumber,
        date,
        customer, // { name, company, address, city, zip, country }
        items, // Array of { description, quantity, price }
        totals, // { subtotal, tax, total }
        settings // { companyName, companyAddress, taxId, bankDetails }
    } = invoiceData;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 10;
    const margin = 50;

    // Helper to draw text
    const drawText = (text, x, y, options = {}) => {
        page.drawText(text, {
            x,
            y,
            size: fontSize,
            font: options.font || font,
            color: options.color || rgb(0, 0, 0),
            ...options,
        });
    };

    // --- HEADER ---
    // Company Info (Top Right)
    let y = height - margin;
    drawText(settings.companyName, width - margin - 150, y, { font: fontBold, size: 12 });
    y -= 15;
    drawText(settings.companyAddress, width - margin - 150, y);
    y -= 15;
    drawText(`Steuernummer: ${settings.taxId}`, width - margin - 150, y);

    // Logo (Placeholder text for now)
    drawText("STERNBLITZ", margin, height - margin, { font: fontBold, size: 20 });

    // --- INVOICE DETAILS ---
    y = height - 150;
    drawText("RECHNUNG", margin, y, { font: fontBold, size: 18 });
    y -= 30;

    drawText(`Rechnungs-Nr.: ${invoiceNumber}`, margin, y);
    drawText(`Datum: ${date}`, width - margin - 150, y);

    y -= 40;

    // --- CUSTOMER ---
    drawText("Rechnungsempfänger:", margin, y, { font: fontBold });
    y -= 15;
    if (customer.company) {
        drawText(customer.company, margin, y);
        y -= 15;
    }
    drawText(customer.name, margin, y);
    y -= 15;
    drawText(customer.address, margin, y);
    y -= 15;
    drawText(`${customer.zip} ${customer.city}`, margin, y);
    y -= 15;
    drawText(customer.country, margin, y);

    // --- ITEMS TABLE ---
    y -= 50;
    const tableTop = y;

    // Headers
    drawText("Beschreibung", margin, y, { font: fontBold });
    drawText("Menge", width - margin - 200, y, { font: fontBold });
    drawText("Einzelpreis", width - margin - 120, y, { font: fontBold });
    drawText("Gesamt", width - margin - 50, y, { font: fontBold });

    y -= 10;
    // Line
    page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0, 0, 0),
    });
    y -= 20;

    // Items
    items.forEach(item => {
        drawText(item.description, margin, y);
        drawText(String(item.quantity), width - margin - 190, y);
        drawText(item.price, width - margin - 120, y);
        drawText(item.total, width - margin - 50, y);
        y -= 20;
    });

    // --- TOTALS ---
    y -= 20;
    page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0, 0, 0),
    });
    y -= 30;

    drawText("Zwischensumme:", width - margin - 200, y);
    drawText(totals.subtotal, width - margin - 50, y);
    y -= 20;
    drawText("USt. (19%):", width - margin - 200, y);
    drawText(totals.tax, width - margin - 50, y);
    y -= 20;
    drawText("Gesamtbetrag:", width - margin - 200, y, { font: fontBold, size: 12 });
    drawText(totals.total, width - margin - 50, y, { font: fontBold, size: 12 });

    // --- FOOTER ---
    // Legal / Bank
    const footerY = 80;
    page.drawLine({
        start: { x: margin, y: footerY },
        end: { x: width - margin, y: footerY },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
    });

    drawText("Zahlbar innerhalb von 14 Tagen ohne Abzug.", margin, footerY - 20);
    drawText(`Bankverbindung: ${settings.bankDetails}`, margin, footerY - 35);
    drawText("Es gelten unsere AGB.", margin, footerY - 50);

    // Serialize
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}
