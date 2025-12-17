import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const runtime = "nodejs";

export async function POST(req) {
    try {
        // 1. Auth Check
        const supabase = await supabaseServerAuth();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Input Validation
        const body = await req.json();
        const { orderId, placeId, companyName, ratingRange, reviewCounts, googleMapsLink } = body;

        if (!orderId || !placeId || !companyName) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const apiKey = process.env.PARTNER_DELETION_API_KEY;
        if (!apiKey) {
            console.error("Missing PARTNER_DELETION_API_KEY");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // 3. Call Partner API
        const partnerUrl = "https://0v1c54ts60.execute-api.eu-central-1.amazonaws.com/dev/webapp/direct-review-deletion-request";

        const payload = {
            email: "office@link-4-all.com", // Fixed as requested
            place_name: companyName,
            outscraper_data: {
                place_id: placeId
            },
            rating_range: ratingRange || { min: 1, max: 3 }, // Default 1-3
            review_counts: reviewCounts,
            google_maps_link: googleMapsLink
        };

        const partnerRes = await fetch(partnerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!partnerRes.ok) {
            const errText = await partnerRes.text();
            console.error("Partner API Error:", partnerRes.status, errText);
            return NextResponse.json({ error: "Partner API failed: " + errText }, { status: partnerRes.status });
        }

        // 4. Update Database
        const admin = supabaseAdmin();
        const { error: dbError } = await admin
            .from("orders")
            .update({ deletion_started_at: new Date().toISOString() })
            .eq("id", orderId);

        if (dbError) {
            console.error("DB Update Error:", dbError);
            // We don't fail the request if the API call succeeded, but we warn
        }

        return NextResponse.json({ ok: true });

    } catch (error) {
        console.error("Deletion API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
