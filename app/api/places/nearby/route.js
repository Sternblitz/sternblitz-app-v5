import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const SCAN_QUERIES = [
    // Gastro & Imbiss
    { type: "restaurant" },
    { type: "cafe" },
    { type: "bar" },
    { type: "bakery" },
    { type: "meal_takeaway" },
    { type: "meal_delivery" },
    { keyword: "Döner" },
    { keyword: "Kebab" },
    { keyword: "Pizza" },
    { keyword: "Burger" },
    { keyword: "Imbiss" },
    { keyword: "Currywurst" },
    { keyword: "Sushi" },

    // Beauty & Wellness
    { type: "hair_care" },
    { keyword: "Barber" },
    { type: "beauty_salon" },
    { keyword: "Nagelstudio" },
    { keyword: "Kosmetik" },
    { keyword: "Wimpern" },
    { type: "spa" },
    { type: "physiotherapist" },

    // Services & Retail (No Clothing)
    { type: "florist" },
    { type: "liquor_store" }, // Spätis
    { type: "car_repair" },
    { type: "laundry" },
    { type: "locksmith" },
    { type: "dentist" },
    { type: "doctor" },
    { type: "real_estate_agency" },
    { type: "insurance_agency" },

    // Missing Important Categories
    { type: "gym" }, // Fitness
    { keyword: "Fitnessstudio" },
    { type: "car_dealer" }, // Autohändler
    { keyword: "Shisha" }, // Shisha Bars
    { keyword: "Hookah" },
    { keyword: "Kiosk" }, // Spätis/Kioske
    { keyword: "Späti" },
    { type: "night_club" }, // Clubs

    // Niche
    { keyword: "Tattoo" },
    { keyword: "Solarium" },
    { keyword: "Sonnenstudio" },
];

export async function POST(request) {
    try {
        // 1. Auth Check
        const supabase = await supabaseServerAuth();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user;

        // 1. Check Daily Limit (Fail-Open: If DB fails, allow scan)
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("daily_scan_count, last_scan_date")
                .eq("user_id", user.id)
                .single();

            if (profile) {
                let { daily_scan_count, last_scan_date } = profile;

                // Reset if new day
                if (last_scan_date !== today) {
                    daily_scan_count = 0;
                }

                const DAILY_LIMIT = 5;
                if (daily_scan_count >= DAILY_LIMIT) {
                    return NextResponse.json({
                        error: `Tageslimit erreicht (${DAILY_LIMIT} Scans/Tag). Komm morgen wieder!`
                    }, { status: 429 });
                }

                // Increment count
                await supabase
                    .from("profiles")
                    .update({
                        daily_scan_count: daily_scan_count + 1,
                        last_scan_date: today
                    })
                    .eq("user_id", user.id);
            }
        } catch (limitError) {
            // Log but don't block. This handles cases where migration hasn't run yet.
            console.warn("Daily limit check failed, proceeding anyway:", limitError);
        }

        const body = await request.json();
        const { lat, lng, radius = 300 } = body;

        if (!lat || !lng) {
            return NextResponse.json({ error: "Missing location" }, { status: 400 });
        }

        // 2. Budget Scan (Single Broad Query) - NO CACHING
        const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server config error" }, { status: 500 });
        }

        // 2. Budget Scan with Pagination (Max 3 pages = 60 results)
        // Cost: 3 requests (still ~94% cheaper than 50)

        const baseUrl = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
        const allResults = [];
        let nextToken = null;

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // Page 1
        const url1 = new URL(baseUrl);
        url1.searchParams.set("location", `${lat},${lng}`);
        url1.searchParams.set("radius", radius);
        url1.searchParams.set("type", "establishment");
        url1.searchParams.set("key", apiKey);

        const res1 = await fetch(url1.toString());
        const data1 = await res1.json();
        if (data1.results) allResults.push(...data1.results);
        nextToken = data1.next_page_token;

        // Page 2
        if (nextToken) {
            await sleep(2000); // Token needs time to become valid
            const url2 = new URL(baseUrl);
            url2.searchParams.set("pagetoken", nextToken);
            url2.searchParams.set("key", apiKey);

            const res2 = await fetch(url2.toString());
            const data2 = await res2.json();
            if (data2.results) allResults.push(...data2.results);
            // No Page 3
        }

        return NextResponse.json({
            results: allResults,
            count: allResults.length,
            source: 'api-paged'
        });
    } catch (e) {
        console.error("Deep scan error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
