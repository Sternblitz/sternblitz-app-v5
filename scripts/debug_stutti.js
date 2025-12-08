const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../stutti.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Read first few rows with headers
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log("Headers:", rows[0]);
if (rows.length > 1) {
    console.log("First Row Data:", rows[1]);
}
