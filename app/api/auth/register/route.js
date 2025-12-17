import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { Resend } from "resend";
import { WelcomeEmail } from "@/lib/emails/welcome";

export const runtime = "nodejs";

export async function POST(req) {
    try {
        const body = await req.json();
        const { email, password, fullName, inviteToken } = body;

        if (!email || !password || !fullName || !inviteToken) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const admin = supabaseAdmin();

        // 1. Verify Invite again (Race condition check)
        const { data: invite, error: inviteError } = await admin
            .from("invites")
            .select("*, teams(org_id, name)")
            .eq("token", inviteToken)
            .single();

        if (inviteError || !invite) {
            return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
        }
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ error: "Invite expired" }, { status: 400 });
        }
        if (invite.max_uses && invite.uses_count >= invite.max_uses) {
            return NextResponse.json({ error: "Invite limit reached" }, { status: 400 });
        }

        const orgId = invite.teams?.org_id || process.env.DEFAULT_ORG_ID;
        if (!orgId) {
            return NextResponse.json({ error: "Organization configuration error" }, { status: 500 });
        }

        // 2. Create Auth User
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm for simplicity in this flow? Or false if email verif needed.
            user_metadata: { full_name: fullName },
        });

        if (authError) throw authError;
        const userId = authData.user.id;

        // 3. Create Profile with Team & Role
        const { error: profileError } = await admin
            .from("profiles")
            .insert({
                user_id: userId,
                full_name: fullName,
                email: email,
                role: invite.role,
                team_id: invite.team_id,
                org_id: orgId,
            });

        if (profileError) {
            // Rollback auth user if profile creation fails
            await admin.auth.admin.deleteUser(userId);
            throw profileError;
        }

        // 4. Increment Invite Usage
        await admin
            .from("invites")
            .update({ uses_count: invite.uses_count + 1 })
            .eq("id", invite.id);

        // 5. Send Welcome Email
        try {
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
                from: process.env.RESEND_FROM || "Sternblitz <onboarding@sternblitz.app>",
                to: email,
                subject: "Willkommen im Team! 🚀",
                react: WelcomeEmail({
                    name: fullName,
                    teamName: invite.teams?.name || "Sternblitz",
                    loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/login`
                }),
            });
        } catch (emailError) {
            console.error("Failed to send welcome email:", emailError);
            // Don't fail the registration if email fails, just log it
        }

        return NextResponse.json({ success: true, userId });
    } catch (e) {
        console.error("register error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
