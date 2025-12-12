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

// Path to Deutschland Master file
const filePath = path.join(__dirname, '../deutschlandwenig.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${rows.length} rows in Deutschland file.`);

const BATCH_SIZE = 100;

async function importData() {
    console.log("Fetching existing leads for deduplication...");

    // Fetch Name/Address signatures to check against
    // We fetch in chunks to avoid memory issues if DB is huge, but for <50k it's fine
    // Let's assume < 100k rows for now.
    let existingSignatures = new Set();

    const { data: existingData, error } = await supabase
        .from('static_leads')
        .select('name, address');

    if (error) {
        console.error("Error fetching existing leads:", error);
        return;
    }

    existingData.forEach(r => {
        if (r.name && r.address) {
            existingSignatures.add(`${r.name.trim()}|${r.address.trim()}`);
        }
    });

    console.log(`Loaded ${existingSignatures.size} existing signatures. Starting import...`);

    let batch = [];
    let count = 0;
    let skipped = 0;

    for (const row of rows) {
        // Prepare Signature
        const name = String(row.Name || "").trim();
        const address = String(row.Adresse || "").trim();

        if (!name) continue; // Skip invalid rows

        const signature = `${name}|${address}`;

        // Deduplication Check
        if (existingSignatures.has(signature)) {
            skipped++;
            continue;
        }

        // Extract Lat/Lng from Link
        const link = row.Link || "";
        const latMatch = link.match(/!3d([\d.]+)/);
        const lngMatch = link.match(/!4d([\d.]+)/);

        let lat = latMatch ? parseFloat(latMatch[1]) : null;
        let lng = lngMatch ? parseFloat(lngMatch[1]) : null;

        // Parse City from Address
        let city = "Deutschland"; // Default fallback
        let zip = "";

        if (address) {
            // German address pattern: "Street 123, 12345 City"
            const zipMatch = address.match(/(\d{5})\s+(.+)$/);
            if (zipMatch) {
                zip = zipMatch[1];
                city = zipMatch[2];
            } else {
                // Heuristic fallback: take last part after comma
                const parts = address.split(",");
                if (parts.length > 1) {
                    city = parts[parts.length - 1].trim();
                }
            }
        }

        batch.push({
            name: name,
            address: address,
            city: city,
            zip: zip,
            lat: lat,
            lng: lng,
            category: 'Uncategorized',
            phone: row.Phone,
            website: row.Website,
            color: row.Farbe,
            rating: row.Rating,
            user_ratings_total: row['Anzahl der Reviews'],
            source_file: 'deutschlandwenig.xlsx', // Marked for selective deletion
        });

        // Add to Set to prevent duplicates WITHIN the file imports
        existingSignatures.add(signature);

        if (batch.length >= BATCH_SIZE) {
            const { error } = await supabase.from('static_leads').insert(batch);
            if (error) console.error("Error inserting batch:", error);
            else count += batch.length;

            // Console update every 1000
            if (count % 1000 === 0) console.log(`Imported ${count} leads so far... (Skipped ${skipped})`);

            batch = [];
        }
    }

    if (batch.length > 0) {
        const { error } = await supabase.from('static_leads').insert(batch);
        if (error) console.error("Error inserting final batch:", error);
        else count += batch.length;
    }

    console.log(`Done!`);
    console.log(`Imported: ${count}`);
    console.log(`Skipped (Duplicates): ${skipped}`);
}

importData();
