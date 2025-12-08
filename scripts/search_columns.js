const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../StuttgartNEW.xlsx');
const workbook = XLSX.readFile(filePath);

console.log("Searching for 'Farbe', 'Color', 'Link' in all sheets...");

workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length > 0) {
        const headers = rows[0].map(h => String(h).toLowerCase());
        const hasFarbe = headers.some(h => h.includes('farbe') || h.includes('color'));
        const hasLink = headers.some(h => h.includes('link'));

        console.log(`Sheet: ${name}`);
        console.log(`  Headers: ${JSON.stringify(rows[0])}`);
        console.log(`  Has Farbe/Color: ${hasFarbe}`);
        console.log(`  Has Link: ${hasLink}`);

        if (hasFarbe) {
            const index = headers.findIndex(h => h.includes('farbe') || h.includes('color'));
            console.log(`  -> Found Color at index ${index}. Sample value: ${rows[1][index]}`);
        }
    }
});
