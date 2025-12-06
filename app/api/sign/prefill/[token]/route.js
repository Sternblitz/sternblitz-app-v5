// app/api/sign/prefill/[token]/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitize(out) {
  // return only the fields needed by the sign page
  const src = out || {};
  const payload = src.payload || {};
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
    "locks",
    "customDiscount",
  ];
  const trimmed = {};
  for (const k of allow) if (k in payload) trimmed[k] = payload[k];
  return {
    payload: trimmed,
    rep_code: src.rep_code || null,
    // no created_by/org/team returned here; submit will validate token again
  };
}

export async function GET(_req, { params }) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Token fehlt" }, { status: 400 });
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("sign_links")
      .select("token, payload, rep_code, created_at, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    const now = Date.now();
    const expires = new Date(data.expires_at || 0).getTime();
    if (data.used_at) return NextResponse.json({ error: "Link wurde bereits verwendet" }, { status: 410 });
    if (!Number.isFinite(expires) || expires < now) return NextResponse.json({ error: "Link abgelaufen" }, { status: 410 });
    return NextResponse.json({ ok: true, ...sanitize(data) });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

