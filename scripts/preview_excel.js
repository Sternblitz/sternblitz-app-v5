const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../Stuttgart.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays

console.log("Headers:", data[0]);
console.log("First Row:", data[1]);
