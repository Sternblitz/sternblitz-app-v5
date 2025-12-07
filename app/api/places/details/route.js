import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const runtime = "nodejs";

export async function POST(request) {
    try {
        // 1. Auth Check
        const supabase = await supabaseServerAuth();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = session.user;
        const body = await request.json();
        const { placeId } = body;

        if (!placeId) {
            return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
        }

        // 2. Check Daily Click Limit (Fail-Open)
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: profile } = await supabase
                .from("profiles")
                .select("daily_click_count, last_click_date")
                .eq("user_id", user.id)
                .single();

            if (profile) {
                let { daily_click_count, last_click_date } = profile;

                // Reset if new day
                if (last_click_date !== today) {
                    daily_click_count = 0;
                }

                const DAILY_LIMIT = 40;
                if (daily_click_count >= DAILY_LIMIT) {
                    return NextResponse.json({
                        error: `Tageslimit erreicht (${DAILY_LIMIT} Details/Tag).`
                    }, { status: 429 });
                }

                // Increment count
                await supabase
                    .from("profiles")
                    .update({
                        daily_click_count: daily_click_count + 1,
                        last_click_date: today
                    })
                    .eq("user_id", user.id);
            }
        } catch (limitError) {
            console.warn("Click limit check failed:", limitError);
        }

        // 3. Fetch Details from Google
        const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server config error" }, { status: 500 });
        }

        const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        url.searchParams.set("place_id", placeId);
        // Fetch only necessary fields to keep costs low (Basic + Atmosphere + Contact)
        // Note: 'reviews' are part of Atmosphere. 'formatted_phone_number' is Contact.
        url.searchParams.set("fields", "name,formatted_address,geometry,rating,user_ratings_total,types,formatted_phone_number,website,url,vicinity");
        url.searchParams.set("key", apiKey);
        // Language German
        url.searchParams.set("language", "de");

        const res = await fetch(url.toString());
        const data = await res.json();

        if (data.status !== "OK") {
            return NextResponse.json({ error: data.error_message || "Google API Error" }, { status: 500 });
        }

        return NextResponse.json({ result: data.result });

    } catch (e) {
        console.error("Details fetch error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
