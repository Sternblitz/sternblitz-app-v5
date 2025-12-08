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

const filePath = path.join(__dirname, '../stutti.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

console.log(`Found ${rows.length} rows. Starting import of colored leads...`);

const BATCH_SIZE = 100;

async function importData() {
    let batch = [];
    let count = 0;

    // Truncate table to remove old data (including Nürnberg)
    const { error: deleteError } = await supabase.from('static_leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) console.error("Error clearing table:", deleteError);
    else console.log("Table cleared.");

    const STUTTGART = { lat: 48.7758, lng: 9.1829 };

    for (const row of rows) {
        // Check for Color Column
        const color = row.Farbe || row.farbe || row.Color || row.color;
        if (!color) continue;

        const colorVal = String(color).toLowerCase().trim();

        // Extract Lat/Lng from Link (NO API CALLS)
        const link = row.Link || row.link || "";
        const latMatch = link.match(/!3d([\d.]+)/);
        const lngMatch = link.match(/!4d([\d.]+)/);

        let lat = latMatch ? parseFloat(latMatch[1]) : null;
        let lng = lngMatch ? parseFloat(lngMatch[1]) : null;

        if (!lat || !lng) continue;

        // Filter Outliers (Distance check)
        // 1 deg lat ~ 111km. If diff > 0.2 (~22km), skip.
        if (Math.abs(lat - STUTTGART.lat) > 0.3 || Math.abs(lng - STUTTGART.lng) > 0.3) {
            // console.log("Skipping outlier (too far):", row.Name, lat, lng);
            continue;
        }

        // Parse Ratings
        // "Rating" -> 4.3
        // "Anzahl der Reviews" -> 4467
        const rating = parseFloat(row.Rating || row.rating || 0);
        const reviews = parseInt(row['Anzahl der Reviews'] || row.Reviews || 0);

        // Prepare record
        batch.push({
            name: row.Name || row.name,
            address: row.Adresse || row.Address || row.address,
            city: "Stuttgart",
            lat: lat,
            lng: lng,
            category: row.main_category || "Uncategorized",
            phone: row.Phone || row.phone,
            website: row.Website || row.website,
            source_file: 'stutti.xlsx',
            color: colorVal,
            rating: isNaN(rating) ? 0 : rating,
            user_ratings_total: isNaN(reviews) ? 0 : reviews
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

    console.log(`Done! Imported ${count} colored leads.`);
}

importData();
