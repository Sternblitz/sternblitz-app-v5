import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token");

        if (!token) {
            return NextResponse.json({ error: "Token missing" }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const { data: invite, error } = await admin
            .from("invites")
            .select("*, teams(name)")
            .eq("token", token)
            .single();

        if (error || !invite) {
            return NextResponse.json({ valid: false, error: "Invite not found" }, { status: 404 });
        }

        // Check expiration
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ valid: false, error: "Invite expired" }, { status: 410 });
        }

        // Check usage limit
        if (invite.max_uses && invite.uses_count >= invite.max_uses) {
            return NextResponse.json({ valid: false, error: "Invite limit reached" }, { status: 410 });
        }

        return NextResponse.json({
            valid: true,
            teamName: invite.teams?.name || "Unbekanntes Team",
            role: invite.role,
        });
    } catch (e) {
        console.error("verify invite error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
