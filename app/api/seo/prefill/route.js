// app/api/seo/prefill/route.js
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function base64url(bytes) {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pickSafePayload(input = {}) {
  const allow = [
    "googleProfile",
    "googleUrl",
    "company",
    "firstName",
    "lastName",
    "email",
    "phone",
  ];
  const out = {};
  for (const k of allow) if (k in input) out[k] = input[k];
  return out;
}

export async function POST(req) {
  try {
    const supabase = await supabaseServerAuth();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user || null;

    const body = await req.json().catch(() => ({}));
    const payload = pickSafePayload(body?.payload || body || {});
    const rep_code = typeof body?.rep_code === "string" ? body.rep_code.trim() || null : null;
    if (!payload?.googleProfile) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });

    const admin = supabaseAdmin();
    const token = `sl_${base64url(crypto.randomBytes(24))}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const row = {
      token,
      payload,
      rep_code,
      source_account_id: user?.id || null,
      org_id: null,
      team_id: null,
      created_by: user?.id || crypto.randomBytes(8).toString("hex"),
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };
    const { error: insErr } = await admin.from("sign_links").insert([row]);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 503 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const url = `${(appUrl || "").replace(/\/$/, "") || ""}/seo?t=${encodeURIComponent(token)}`.replace(/^\/+/, "/");
    return NextResponse.json({ ok: true, token, url });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

