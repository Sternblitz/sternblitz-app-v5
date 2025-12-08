const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../StuttgartNEW.xlsx');
const workbook = XLSX.readFile(filePath);

console.log("Sheet Names:", workbook.SheetNames);

workbook.SheetNames.forEach(name => {
    console.log(`--- Sheet: ${name} ---`);
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    console.log(`Range: ${sheet['!ref']} (Cols: ${range.e.c + 1})`);

    // Read first row (headers)
    const headers = [];
    for (let C = 0; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: C })];
        headers.push(cell ? cell.v : "UNDEFINED");
    }
    console.log("Headers:", headers);

    // Check first few rows for data in the last few columns
    for (let R = 1; R <= 3; ++R) {
        const row = [];
        for (let C = 0; C <= range.e.c; ++C) {
            const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
            row.push(cell ? cell.v : "");
        }
        console.log(`Row ${R}:`, row);
    }
});
