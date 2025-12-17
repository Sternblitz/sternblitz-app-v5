// app/api/seo/prefill/email/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const supabase = await supabaseServerAuth();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData?.user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const token = (body?.token || "").trim();
    const to = (body?.to_email || "").trim();
    if (!token) return NextResponse.json({ error: "Token fehlt" }, { status: 400 });
    if (!to) return NextResponse.json({ error: "Empfänger fehlt" }, { status: 400 });

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return NextResponse.json({ error: "E-Mail Versand nicht konfiguriert" }, { status: 500 });
    }
    const admin = supabaseAdmin();
    const { data: link, error } = await admin
      .from("sign_links")
      .select("payload")
      .eq("token", token)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!link) return NextResponse.json({ error: "Link nicht gefunden" }, { status: 404 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const href = `${(appUrl || "").replace(/\/$/, "")}/seo?t=${encodeURIComponent(token)}`;
    const payload = link.payload || {};
    const firstName = (payload?.firstName || "").trim();

    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.RESEND_FROM;
    const subject = "Bitte Auftrag bestätigen – Sternblitz SEO";
    const html = `
      <div style=\"font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.58;color:#0f172a\">\n        <div style=\"max-width:640px;margin:0 auto;padding:28px 20px 8px\">\n          <h1 style=\"margin:0 0 10px;font-size:20px\">Hallo ${firstName || ''}!</h1>\n          <p style=\"margin:0 0 12px\">bitte bestätige deinen SEO‑Auftrag.</p>\n          <p style=\"margin:0 0 16px\"><a href=\"${href}\" style=\"display:inline-block;background:#0b6cf2;color:#fff;font-weight:900;padding:10px 14px;border-radius:999px;text-decoration:none\">Hier klicken und bestätigen</a></p>\n          <div style=\"color:#64748b\">Monatlicher Fixpreis 99 € · monatlich kündbar</div>\n        </div>\n      </div>`;
    const text = `Hallo ${firstName || ''}!\n\nBitte bestätige deinen SEO‑Auftrag:\n${href}\n\nMonatlicher Fixpreis 99 € · monatlich kündbar.`;
    const { error: mailErr } = await resend.emails.send({ from: FROM, to, subject, html, text });
    if (mailErr) return NextResponse.json({ error: mailErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

