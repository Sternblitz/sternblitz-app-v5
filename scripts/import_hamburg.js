require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Adjusted path to Hamburg.xlsx in the root directory
const filePath = path.join(__dirname, '../hamburgg.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${rows.length} rows. Starting import for Hamburg...`);

const BATCH_SIZE = 100;

async function importData() {
    let batch = [];
    let count = 0;

    for (const row of rows) {
        // Extract Lat/Lng from Link
        // Format: ...!3d48.773188!4d9.173306...
        const link = row.Link || "";
        const latMatch = link.match(/!3d([\d.]+)/);
        const lngMatch = link.match(/!4d([\d.]+)/);

        let lat = latMatch ? parseFloat(latMatch[1]) : null;
        let lng = lngMatch ? parseFloat(lngMatch[1]) : null;

        // Fallback: Check if address has city/zip
        // "Lilienstrasse 36, 20095 Hamburg"
        let city = "Hamburg"; // Default to Hamburg
        let zip = "";
        const address = row.Adresse || "";

        if (address) {
            const zipMatch = address.match(/(\d{5})\s+(.+)$/);
            if (zipMatch) {
                zip = zipMatch[1];
                city = zipMatch[2]; // Ideally this matches Hamburg or a district
            }
        }

        batch.push({
            name: row.Name, // Capitalized 'Name'
            address: address, // Map 'Adresse' to address
            city: city,
            zip: zip,
            lat: lat,
            lng: lng,
            category: 'Uncategorized', // Default as per existing data
            phone: row.Phone,
            website: row.Website,
            color: row.Farbe, // Map Farbe to color
            rating: row.Rating, // Map Rating
            user_ratings_total: row['Anzahl der Reviews'], // Map review count
            source_file: 'hamburgg.xlsx', // Updated source file
            // Map other fields if needed
        });

        if (batch.length >= BATCH_SIZE) {
            const { error } = await supabase.from('static_leads').insert(batch);
            if (error) console.error("Error inserting batch:", error);
            else count += batch.length;
            console.log(`Imported ${count} leads...`);
            batch = [];
        }
    }

    if (batch.length > 0) {
        const { error } = await supabase.from('static_leads').insert(batch);
        if (error) console.error("Error inserting final batch:", error);
        else count += batch.length;
    }

    console.log(`Done! Imported ${count} leads.`);
}

importData();
