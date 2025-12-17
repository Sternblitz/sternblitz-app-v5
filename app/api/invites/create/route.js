import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(req) {
    try {
        const supabase = await supabaseServerAuth();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check Admin
        const admin = supabaseAdmin();
        const { data: profile } = await admin
            .from("profiles")
            .select("role")
            .eq("user_id", user.id)
            .single();

        if (profile?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { team_id, role = "SALES", max_uses = null, expires_in_days = 30 } = body;

        if (!team_id) {
            return NextResponse.json({ error: "Team ID required" }, { status: 400 });
        }

        // Generate secure token
        const token = crypto.randomBytes(16).toString("hex");
        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + (expires_in_days || 30));

        const { data, error } = await admin
            .from("invites")
            .insert({
                token,
                team_id,
                role,
                created_by: user.id,
                expires_at: expires_at.toISOString(),
                max_uses: max_uses ? Number(max_uses) : null,
            })
            .select()
            .single();

        if (error) throw error;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sternblitz.app";
        const inviteUrl = `${appUrl}/join?token=${token}`;

        return NextResponse.json({ inviteUrl, token, ...data });
    } catch (e) {
        console.error("create invite error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
