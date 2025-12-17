import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export async function POST(req) {
    try {
        const supabase = await supabaseServerAuth();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        console.log("Track Activity Auth Check:", { user: user?.id, authError });

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        console.log("Track Activity Payload:", body);
        const { action_type, metadata, curr_path } = body;

        if (!action_type) {
            return NextResponse.json({ error: "Missing action_type" }, { status: 400 });
        }

        // Optional: Get org_id from profile if needed for multi-tenant, 
        // but for now we just log the user_id mainly. 
        // If we need org_id, we can fetch it, but let's trust the user is valid.

        // Attempt to get org_id from profile for completeness
        let org_id = null;
        try {
            const { data: profile } = await supabase.from('profiles').select('org_id').eq('user_id', user.id).single();
            if (profile) org_id = profile.org_id;
        } catch (e) {
            console.error("Error fetching profile for org_id:", e);
        }

        const { error } = await supabase.from("user_activities").insert({
            user_id: user.id,
            org_id: org_id || null,
            action_type,
            metadata: metadata || {},
            curr_path: curr_path || "/",
        });

        if (error) {
            console.error("Activity insert error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log("Activity inserted successfully for user:", user.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Track API error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
