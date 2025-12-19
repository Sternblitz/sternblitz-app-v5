const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Try to find the file with different casing if needed, but list_dir should have solved this.
// Based on typical user behavior, it's likely 'Sigmaringen.xlsx' or 'sigmaringen.xlsx'
const possibleNames = ['Sigmaringen.xlsx', 'sigmaringen.xlsx'];
let filePath = '';

for (const name of possibleNames) {
    const p = path.join(__dirname, '../' + name);
    if (fs.existsSync(p)) {
        filePath = p;
        break;
    }
}

if (!filePath) {
    console.error("File not found");
    process.exit(1);
}

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Get headers (first row) and first data row
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("Headers:", rows[0]);
    if (rows.length > 1) {
        console.log("First Row Data:", rows[1]);
    }
} catch (e) {
    console.error("Error reading file:", e.message);
}
