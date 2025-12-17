const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../Stuttgart.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

let withCoords = 0;
let withoutCoords = 0;

rows.forEach(row => {
    const link = row.Link || row.link || "";
    const hasCoords = link.includes("!3d") && link.includes("!4d");

    if (hasCoords) {
        withCoords++;
    } else {
        withoutCoords++;
        if (withoutCoords <= 5) {
            console.log("Sample without coords:", row.Name || row.name, "|", row.Address || row.address);
        }
    }
});

console.log(`Total rows: ${rows.length}`);
console.log(`With coordinates: ${withCoords}`);
console.log(`Without coordinates: ${withoutCoords}`);
