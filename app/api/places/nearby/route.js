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

        const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", radius);
        url.searchParams.set("type", "establishment");
        url.searchParams.set("key", apiKey);

        try {
            const res = await fetch(url.toString());
            const data = await res.json();
            const results = data.results || [];

            return NextResponse.json({
                results: results,
                count: results.length,
                source: 'api'
            });

        } catch (e) {
            console.error("Places API error", e);
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    } catch (e) {
        console.error("Deep scan error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
