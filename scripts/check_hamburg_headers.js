const XLSX = require('xlsx');
const path = require('path');

const FILE = path.join(process.cwd(), "Munchen.xlsx");
try {
    const workbook = XLSX.readFile(FILE);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Get headers (first row)
    const headers = [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const R = range.s.r;
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({ c: C, r: R })];
        if (cell && cell.v) headers.push(cell.v);
    }
    console.log("Headers:", headers.join(", "));

    // Also show first row of data to see formatting
    const rows = XLSX.utils.sheet_to_json(sheet, { header: headers, range: 1 });
    if (rows.length > 0) {
        console.log("First row sample:", JSON.stringify(rows[0], null, 2));
    }
} catch (e) {
    console.error("Error reading file:", e.message);
}
