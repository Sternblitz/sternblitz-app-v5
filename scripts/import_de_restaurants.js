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

// Path to DERestaurants file
const filePath = path.join(__dirname, '../DERestaurants.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${rows.length} rows in DERestaurants file.`);

const BATCH_SIZE = 100;

async function importData() {
    console.log("Fetching existing leads for deduplication...");

    // Fetch Name/Address signatures to check against
    let existingSignatures = new Set();

    // Fetching in pages to be safe, though for <100k it might fit in memory.
    // Using simple select for now as per other scripts.
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
        // Prepare Signature
        const name = String(row.name || "").trim(); // Note: Header is lowercase 'name' in DERestaurants based on check
        const address = String(row.address || "").trim(); // Header is 'address'

        if (!name) continue; // Skip invalid rows

        const signature = `${name}|${address}`;

        // Deduplication Check
        if (existingSignatures.has(signature)) {
            skipped++;
            continue;
        }

        // Extract Lat/Lng from Link
        const link = row.link || "";
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
                // Clean up city if it has extra chars (sometimes happens)
                if (city.includes(',')) {
                    city = city.split(',')[0].trim();
                }
            } else {
                // Heuristic fallback: take last part after comma
                const parts = address.split(",");
                if (parts.length > 1) {
                    city = parts[parts.length - 1].trim();
                    // try to extract zip from that part if possible
                    const zipInCity = city.match(/(\d{5})/);
                    if (zipInCity) {
                        zip = zipInCity[1];
                        city = city.replace(zip, '').trim();
                    }
                }
            }
        }

        // Clean up category
        let category = row.main_category || 'Uncategorized';

        batch.push({
            name: name,
            address: address,
            city: city,
            zip: zip,
            lat: lat,
            lng: lng,
            category: category,
            phone: row.phone,
            website: row.website, // Note: header might be missing or different, check results: headers were [name, main_category, rating, reviews, phone, address, link, Farbe] - website is NOT in headers!
            // Wait, checking check_de_restaurants.js output again...
            // Headers: ['name', 'main_category', 'rating', 'reviews', 'phone', 'address', 'link', 'Farbe']
            // Website is missing from headers.
            color: row.Farbe,
            rating: row.rating,
            user_ratings_total: row.reviews,
            source_file: 'DERestaurants.xlsx',
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
