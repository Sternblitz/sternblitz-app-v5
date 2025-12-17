// app/api/sign/prefill/email/route.js
import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function labelFor(opt) {
  return opt === "123" ? "1–3 Sterne löschen"
    : opt === "12" ? "1–2 Sterne löschen"
      : opt === "1" ? "1 Stern löschen"
        : "Individuelle Löschungen";
}

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Ungültige E‑Mail" }, { status: 400 });

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return NextResponse.json({ error: "E-Mail Versand nicht konfiguriert (RESEND_API_KEY/RESEND_FROM)" }, { status: 500 });
    }

    const admin = supabaseAdmin();
    const { data: link, error } = await admin
      .from("sign_links")
      .select("token, payload, rep_code, created_at, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!link) return NextResponse.json({ error: "Link nicht gefunden" }, { status: 404 });
    const now = Date.now();
    const exp = link.expires_at ? new Date(link.expires_at).getTime() : 0;
    if (link.used_at) return NextResponse.json({ error: "Link wurde bereits verwendet" }, { status: 410 });
    if (!exp || exp < now) return NextResponse.json({ error: "Link abgelaufen" }, { status: 410 });

    const payload = link.payload || {};
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const href = `${(appUrl || "").replace(/\/$/, "") || ""}/sign?t=${encodeURIComponent(token)}`.replace(/^\/+/, "/");
    const firstName = (payload?.firstName || "").trim();
    const googleProfile = payload?.googleProfile || "—";
    const selectedLabel = labelFor(payload?.selectedOption);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM = process.env.RESEND_FROM;
    const REPLY_TO = process.env.RESEND_REPLY_TO;

    const subject = "Bitte Auftrag bestätigen – Sternblitz";
    const html = `
      <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.58;color:#0f172a;background:#ffffff;padding:0;margin:0">
        <div style="max-width:640px;margin:0 auto;padding:28px 20px 8px">
          <h1 style="margin:0 0 10px;font-size:20px;letter-spacing:.2px">Hallo ${firstName || ''}!</h1>
          <p style="margin:0 0 16px">bitte bestätige deinen Auftrag – die Seite ist bereits für dich vorausgefüllt.</p>

          <a href="${href}" style="display:inline-block;background:#0b6cf2;color:#fff;font-weight:900;padding:12px 18px;border-radius:999px;text-decoration:none">Hier klicken und Auftrag bestätigen</a>

          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:18px 0;background:#f9fbff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Google‑Profil</div>
            <div style="font-weight:700">${googleProfile}</div>
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:12px 0;background:#ffffff">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Zu löschende Bewertungen</div>
            <div style="font-weight:700">${selectedLabel}</div>
          </div>

          <p style="margin:10px 0 0;color:#64748b">Wenn der Button nicht funktioniert, öffne diesen Link: <a href="${href}" style="color:#0b6cf2;text-decoration:none">${href}</a></p>
        </div>

        <div style="max-width:640px;margin:0 auto;padding:0 20px 28px">
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0 18px"/>
          <table role="presentation" style="width:100%;border-collapse:collapse">
            <tr><td style="font-weight:900;padding:0 0 6px">Sternblitz Auftragsservice</td></tr>
            <tr><td style="padding:0 0 4px">📧 <a href="mailto:info@sternblitz.de" style="color:#0b6cf2;text-decoration:none">info@sternblitz.de</a></td></tr>
            <tr><td>🌐 <a href="https://sternblitz.de" style="color:#0b6cf2;text-decoration:none">sternblitz.de</a></td></tr>
          </table>
        </div>
      </div>
    `.trim();
    const text = `Hallo ${firstName || ''}!

Bitte bestätige deinen Auftrag – der Link ist bereits vorausgefüllt:
${href}

Google‑Profil: ${googleProfile}
Zu löschende Bewertungen: ${selectedLabel}

Sternblitz Auftragsservice
info@sternblitz.de · sternblitz.de`;

    const payloadEmail = {
      from: FROM,
      to: to,
      subject,
      html,
      text,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
    };
    const { error: mailErr } = await resend.emails.send(payloadEmail);
    if (mailErr) return NextResponse.json({ error: mailErr.message || "E-Mail Versand fehlgeschlagen" }, { status: 500 });
    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

