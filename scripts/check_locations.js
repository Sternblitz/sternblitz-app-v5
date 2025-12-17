const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../stutti.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

console.log(`Total rows: ${rows.length}`);

let nonStuttgart = 0;
let nurnberg = 0;

rows.forEach(row => {
    const addr = (row.Adresse || row.Address || "").toLowerCase();
    if (!addr.includes("stuttgart")) {
        nonStuttgart++;
        if (addr.includes("nürnberg") || addr.includes("nuernberg")) {
            nurnberg++;
        }
        if (nonStuttgart <= 5) {
            console.log("Non-Stuttgart sample:", addr);
        }
    }
});

console.log(`Rows not containing 'Stuttgart': ${nonStuttgart}`);
console.log(`Rows containing 'Nürnberg': ${nurnberg}`);
