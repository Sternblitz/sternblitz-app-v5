const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const filePath = path.join(__dirname, '../Stuttgart.xlsx');

// 1. Check File Stats
try {
    const stats = fs.statSync(filePath);
    console.log("File Last Modified:", stats.mtime.toISOString());
} catch (e) {
    console.error("File not found:", e.message);
    process.exit(1);
}

// 2. Read File
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// 3. Read as Objects (to see all keys)
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

console.log("Total Rows:", rows.length);
if (rows.length > 0) {
    console.log("First Row Keys:", Object.keys(rows[0]));
    console.log("First Row Data:", rows[0]);

    // Check for any row with "x" or "rot" or "red" in any field
    const sample = rows.find(r => Object.values(r).some(v =>
        typeof v === 'string' && (v.toLowerCase() === 'x' || v.toLowerCase().includes('rot') || v.toLowerCase().includes('red'))
    ));

    if (sample) {
        console.log("Found a row with potential marker:", sample);
    } else {
        console.log("No row found with 'x', 'rot', or 'red' value.");
    }
}
