require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const sqlPath = path.join(__dirname, '../supabase/migrations/20251208_add_color_to_static_leads.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Note: Supabase JS client doesn't support raw SQL execution directly on the public interface usually,
    // but we can try rpc if a function exists, or use the pg library if we had connection string.
    // However, since we don't have direct SQL access easily without psql or a connection string,
    // we might need to rely on the user to run it or use a workaround.
    // BUT: We can use the 'postgres' library if we have the connection string.
    // Let's check if we have a connection string in env.

    console.log("Applying migration manually via Supabase Dashboard is recommended if this fails.");
    console.log("SQL to run:", sql);

    // Alternative: Just assume it works or ask user. 
    // Actually, we can use the 'postgres' npm package if available, or 'pg'.
    // Let's try to see if 'pg' is installed.
    try {
        const { Client } = require('pg');
        if (process.env.DATABASE_URL) {
            const client = new Client({ connectionString: process.env.DATABASE_URL });
            await client.connect();
            await client.query(sql);
            await client.end();
            console.log("Migration applied successfully via pg client.");
        } else {
            console.error("No DATABASE_URL found. Cannot apply migration automatically.");
        }
    } catch (e) {
        console.error("Failed to apply migration:", e.message);
        console.log("Please run the following SQL in your Supabase SQL Editor:");
        console.log(sql);
    }
}

runMigration();
