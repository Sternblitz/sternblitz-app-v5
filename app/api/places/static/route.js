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

        const body = await request.json();
        const { north, south, east, west } = body;

        if (!north || !south || !east || !west) {
            return NextResponse.json({ error: "Missing bounds" }, { status: 400 });
        }

        // 2. Fetch from DB
        // Simple bounding box query
        const { data, error } = await supabase
            .from("static_leads")
            .select("*")
            .gte("lat", south)
            .lte("lat", north)
            .gte("lng", west)
            .lte("lng", east)
            .limit(200); // Limit to prevent crashing the map with too many markers

        if (error) {
            throw error;
        }

        return NextResponse.json({ results: data });

    } catch (e) {
        console.error("Static leads fetch error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
