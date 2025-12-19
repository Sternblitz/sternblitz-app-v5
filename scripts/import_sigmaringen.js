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

// Path to Sigmaringen file
// Try both capitalizations just in case, though usually list_dir confirms it.
// list_dir showed 'Sigmaringen.xlsx'
const filePath = path.join(__dirname, '../Sigmaringen.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${rows.length} rows in Sigmaringen file.`);

const BATCH_SIZE = 100;

async function importData() {
    console.log("Fetching existing leads for deduplication...");

    // Fetch Name/Address signatures to check against
    let existingSignatures = new Set();

    // Using stream or pagination is better for huge datasets, but for this app size select() is fine so far.
    const { data: existingData, error } = await supabase
        .from('static_leads')
        .select('name, address');

    if (error) {
        console.error("Error fetching existing leads:", error);
        return;
    }

    if (existingData) {
        existingData.forEach(r => {
            if (r.name && r.address) {
                existingSignatures.add(`${r.name.trim()}|${r.address.trim()}`);
            }
        });
    }

    console.log(`Loaded ${existingSignatures.size} existing signatures. Starting import...`);

    let batch = [];
    let count = 0;
    let skipped = 0;

    for (const row of rows) {
        // Headers matches FFM format: ['Name', 'Reviews', 'Anzahl der Reviews', 'Rating', 'Website', 'Phone', 'Adresse', 'Link', 'Farbe']

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
        let city = "";
        let zip = "";

        if (address) {
            // Address pattern: "Street 123, 12345 City"
            const zipMatch = address.match(/(\d{5})\s+(.+)$/);
            if (zipMatch) {
                zip = zipMatch[1];
                // checking if extracted city part is valid
                if (zipMatch[2] && zipMatch[2].length > 2) {
                    city = zipMatch[2].replace(',', '').trim();
                }
            } else {
                // Heuristic fallback
                const parts = address.split(",");
                if (parts.length > 1) {
                    city = parts[parts.length - 1].trim();
                    const zipInCity = city.match(/(\d{5})/);
                    if (zipInCity) {
                        zip = zipInCity[1];
                        city = city.replace(zip, '').trim();
                    }
                }
            }
        }

        // Default city if extraction failed
        if (!city) city = "Sigmaringen";

        batch.push({
            name: name,
            address: address,
            city: city,
            zip: zip,
            lat: lat,
            lng: lng,
            category: 'Uncategorized', // No category column
            phone: row.Phone,
            website: row.Website,
            color: row.Farbe,
            rating: row.Rating,
            user_ratings_total: row['Anzahl der Reviews'],
            source_file: 'Sigmaringen.xlsx',
        });

        // Add to Set to prevent duplicates WITHIN the file imports
        existingSignatures.add(signature);

        if (batch.length >= BATCH_SIZE) {
            const { error } = await supabase.from('static_leads').insert(batch);
            if (error) console.error("Error inserting batch:", error);
            else count += batch.length;

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
