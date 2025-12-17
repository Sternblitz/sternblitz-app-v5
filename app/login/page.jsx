// app/login/page.jsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const [redirectTarget, setRedirectTarget] = useState("/dashboard");

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get("redirect");
        if (raw) {
          const decoded = decodeURIComponent(raw);
          if (decoded.startsWith("/")) {
            setRedirectTarget(decoded);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Check if already logged in on mount
    const checkSession = async () => {
      try {
        const { data } = await supabase().auth.getSession();
        if (active && data?.session) {
          router.replace(redirectTarget);
        }
      } catch { /* ignore */ }
    };

    checkSession();

    // Listener only for external changes (e.g. other tab login), NOT for manual login here
    const { data: listener } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Only redirect if we are NOT currently submitting the form
        // This prevents the race condition with onLogin's manual redirect
        if (!loading) {
          router.replace(redirectTarget);
        }
      }
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, [router, redirectTarget, loading]);

  const onLogin = async (e) => {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!email || !pw) {
      setErr("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    setLoading(true);
    const { error } = await supabase().auth.signInWithPassword({
      email,
      password: pw,
    });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk("Login erfolgreich. Weiterleiten…");
    // Track Activity
    try {
      fetch("/api/track-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: "LOGIN", curr_path: "/login" }),
        keepalive: true
      });
    } catch { }

    // Tiny delay to ensure browser queues the request before redirect
    setTimeout(() => {
      router.replace(redirectTarget);
    }, 100);
  };

  return (
    <main className="login-bg">
      <section className="login-box">
        <div className="head">
          <img
            src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68ad4679902a5d278c4cf0bc_Group%202085662922-p-500.png"
            alt="Sternblitz Logo"
            className="logo"
          />
          <h1 className="headline">STERNBLITZ-SALESTOOL</h1>
          <p className="subtitle">Die All-in-One-Lösung</p>
        </div>

        <form onSubmit={onLogin} className="form">
          <h2 className="login-text">Login</h2>

          <label className="label">E-Mail-Adresse</label>
          <input
            className="input"
            autoComplete="email"
            placeholder="vorname@sternblitz.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="label">Passwort</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />

          {err && <p className="msg err">{err}</p>}
          {ok && <p className="msg ok">{ok}</p>}

          <button disabled={loading} className="cta">
            {loading ? "..." : "Einloggen"}
          </button>

          <p className="hint">Nur für autorisierte Sternblitz-Mitarbeiter.</p>
        </form>
      </section>

      <style jsx>{`
        :global(html), :global(body) { height: 100%; }
        .login-bg {
          min-height: 100vh; display:flex; align-items:center; justify-content:center; padding:36px 12px;
          background:url("https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/689acdb9f72cb41186204eda_stars-rating.webp") center/cover no-repeat;
          font-family:'Poppins', ui-sans-serif, system-ui, -apple-system;
        }
        .login-box { width:100%; max-width:460px; background:#fff; border-radius:18px; padding:26px 20px 22px; box-shadow:0 6px 30px rgba(0,0,0,.12); box-sizing:border-box; }
        .head { display:flex; flex-direction:column; align-items:center; margin-bottom:14px; }
        .logo { height:68px; width:auto; margin-bottom:6px; }
        .headline { font-family:'Outfit', sans-serif; font-size:24px; font-weight:800; color:#010101; margin:0; line-height:1.15; text-align:center; }
        .subtitle { font-size:14.5px; color:rgba(1,1,1,.75); font-weight:600; margin:6px 0 0; line-height:1.3; }
        .form { width:100%; max-width:360px; margin:8px auto 0; display:flex; flex-direction:column; gap:8px; }
        .login-text { font-size:20px; font-weight:800; color:#000; margin:0 0 8px 0; text-align:center; line-height:1.1; }
        .label { font-size:12.5px; color:#333; margin-top:6px; line-height:1.2; }
        .input { width:100%; padding:12px 14px; border:1px solid rgba(1,1,1,.12); border-radius:12px; font-size:15.5px; outline:none; transition: box-shadow .18s ease, border-color .18s ease; box-sizing:border-box; }
        .input:focus { border-color:#49a84c; box-shadow:0 0 0 2px rgba(73,168,76,.22); }
        .msg { margin:6px 0 0; font-size:14px; text-align:center; }
        .msg.err { color:#dc2626; }
        .msg.ok { color:#065f46; }
        .cta { margin-top:14px; width:100%; padding:13px 14px; border-radius:12px; background:linear-gradient(90deg,#000,#333); color:#fff; font-weight:700; font-size:16.5px; border:0; cursor:pointer; transition: transform .05s ease, filter .2s ease; }
        .cta:hover { filter:brightness(1.06); }
        .cta:active { transform:translateY(1px); }
        .hint { margin-top:12px; font-size:12.5px; color:#6b7280; text-align:center; line-height:1.2; }
        @media (max-width:480px){
          .login-box{ max-width:94vw; padding:22px 16px 18px; border-radius:14px; }
          .logo{ height:58px; }
          .headline{ font-size:21px; }
          .subtitle{ font-size:13.5px; }
          .form{ max-width:100%; }
        }
      `}</style>
    </main>
  );
}
