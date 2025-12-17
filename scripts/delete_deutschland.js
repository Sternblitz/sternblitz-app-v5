require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteDeutschlandData() {
    console.log("Deleting leads from 'deutschlandwenig.xlsx'...");

    // We can use count: 'exact' to see how many were deleted
    const { error, count } = await supabase
        .from('static_leads')
        .delete({ count: 'exact' })
        .eq('source_file', 'deutschlandwenig.xlsx');

    if (error) {
        console.error("Error deleting data:", error);
    } else {
        console.log(`Successfully deleted ${count} rows.`);
    }
}

deleteDeutschlandData();
