const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../stutti.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const STUTTGART = { lat: 48.7758, lng: 9.1829 };
let outliers = 0;

rows.forEach(row => {
    const link = row.Link || row.link || "";
    const latMatch = link.match(/!3d([\d.]+)/);
    const lngMatch = link.match(/!4d([\d.]+)/);

    if (latMatch && lngMatch) {
        const lat = parseFloat(latMatch[1]);
        const lng = parseFloat(lngMatch[1]);

        // Simple distance check (approx)
        const dLat = lat - STUTTGART.lat;
        const dLng = lng - STUTTGART.lng;
        // 1 deg lat ~ 111km. 1 deg lng ~ 70km.
        // If diff > 0.5 deg (~50km), it's far.

        if (Math.abs(dLat) > 0.5 || Math.abs(dLng) > 0.5) {
            outliers++;
            if (outliers <= 10) {
                console.log(`Outlier: ${row.Name} (${lat}, ${lng}) - Address: ${row.Adresse}`);
            }
        }
    }
});

console.log(`Total outliers (> ~50km): ${outliers}`);
