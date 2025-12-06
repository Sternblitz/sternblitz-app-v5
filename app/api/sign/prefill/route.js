// app/api/sign/prefill/route.js
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function base64url(bytes) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pickSafePayload(input = {}) {
  // Only allow the fields the sign page understands
  const out = {};
  const allow = [
    "googleProfile",
    "googleUrl",
    "selectedOption",
    "company",
    "firstName",
    "lastName",
    "email",
    "phone",
    "counts",
    "stats",
    "locks", // optional: { googleProfile: true, selectedOption: true, ... }
    "customDiscount", // admin override
  ];
  for (const k of allow) if (k in input) out[k] = input[k];
  return out;
}

export async function POST(req) {
  try {
    const supabase = await supabaseServerAuth();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    const user = userData?.user;
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

    // Load profile for org/team
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("org_id, team_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
    if (!profile) return NextResponse.json({ error: "Profil fehlt" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const payload = pickSafePayload(body?.payload || body || {});
    const rep_code = typeof body?.rep_code === "string" ? body.rep_code.trim() || null : null;

    // Basic validation – require at least a googleProfile or counts to make sense
    if (!payload || Object.keys(payload).length === 0 || !payload.googleProfile) {
      return NextResponse.json({ error: "Ungültige oder leere Eingabe" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const token = `sl_${base64url(crypto.randomBytes(24))}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 Tage

    const row = {
      token,
      payload,
      rep_code,
      source_account_id: user.id,
      org_id: profile.org_id || null,
      team_id: profile.team_id || null,
      created_by: user.id,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };

    const { error: insErr } = await admin.from("sign_links").insert([row]);
    if (insErr) {
      const msg = String(insErr.message || "");
      const hint = msg.includes("schema cache") || msg.includes("does not exist")
        ? "sign_links Tabelle fehlt oder Schema-Cache ist veraltet. Bitte Migration supabase/migrations/20251109_sign_links.sql ausführen und ggf. im SQL-Editor `select pg_notify('pgrst','reload schema');` ausführen."
        : null;
      return NextResponse.json({ error: hint || msg }, { status: 503 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const url = `${(appUrl || "").replace(/\/$/, "") || ""}/sign?t=${encodeURIComponent(token)}`.replace(/^\/+/, "/");
    // Fallback to relative URL if appUrl missing
    const finalUrl = appUrl ? url : `/sign?t=${encodeURIComponent(token)}`;

    return NextResponse.json({ ok: true, token, url: finalUrl, expires_at: row.expires_at });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
