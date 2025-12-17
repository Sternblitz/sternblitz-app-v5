"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const reasonMessage = (reason) => {
  switch (reason) {
    case "inactive":
      return "Code ist deaktiviert";
    case "expired":
      return "Code ist abgelaufen";
    case "exhausted":
      return "Maximale Einlösungen erreicht";
    case "not_found":
      return "Code nicht gefunden";
    default:
      return "Code ungültig";
  }
};

export default function ReferralPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(null);
  const [myCode, setMyCode] = useState(null);
  const [origin, setOrigin] = useState("");
  const autoRan = useRef(false);
  const [showMine, setShowMine] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("sb_ref_my_code");
      if (stored) setMyCode(stored.toUpperCase());
    } catch {}
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const shareLink = useMemo(() => {
    if (!myCode) return "";
    return `${origin.replace(/\/$/, "")}/empfehlen?ref=${encodeURIComponent(myCode)}`;
  }, [origin, myCode]);
  async function applyCode(input) {
    setStatus(null);
    const trimmed = (input || code || "").trim();
    if (!trimmed) return;
    try {
      const res = await fetch("/api/referrals/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const msg = json?.message || reasonMessage(json?.reason);
        setStatus({ ok: false, msg });
        return;
      }
      const normalized = (json?.code || trimmed).toUpperCase();
      document.cookie = `sb_ref=${normalized}; Max-Age=2592000; Path=/`;
      try {
        sessionStorage.setItem("sb_ref_code", normalized);
        if (typeof json.discount_cents === "number") {
          sessionStorage.setItem("sb_ref_discount", String(json.discount_cents));
        }
        // Mark as fresh activation from /empfehlen with timestamp
        sessionStorage.setItem("sb_ref_from_empfehlen", "1");
        sessionStorage.setItem("sb_ref_from_empfehlen_at", String(Date.now()));
      } catch {}
      setStatus({
        ok: true,
        msg: `Promo aktiviert: −${(json.discount_cents / 100).toLocaleString("de-DE", {
          style: "currency",
          currency: "EUR",
        })}`,
      });
    } catch (err) {
      setStatus({ ok: false, msg: err?.message || String(err) });
    }
  }

  const submit = async (e) => {
    e.preventDefault();
    applyCode(code);
  };

  // Auto-Prefill/Apply bei ?ref= oder ?code=
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get("ref") || u.searchParams.get("code") || "";
      const mine = u.searchParams.get("mine");
      if (mine && ["1","true","yes"].includes(String(mine).toLowerCase())) setShowMine(true);
      if (q) {
        setCode(q);
        applyCode(q);
      }
    } catch {}
  }, []);

  return (
    <main className="ref-shell">
      <section className="card">
        <div className="head">
          <img
            className="logo"
            src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68ad4679902a5d278c4cf0bc_Group%202085662922-p-500.png"
            alt="Sternblitz"
          />
        </div>
        <div className="hero">
          <h1>Freunde werben & sparen</h1>
          <p className="sub">Teile den Link und den Code – Freunde sparen 25 €, du erhältst einen 25 € Gutschein.</p>
        </div>
        <form onSubmit={submit} className="ref-form">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code eingeben (z. B. MaxMN25)"
            className="code"
          />
          <button className="confirm" type="submit">
            Aktivieren
          </button>
        </form>
        {status ? <div className={status.ok ? "ok" : "err"}>{status.msg}</div> : null}
        <div className="hint">Der Rabatt gilt automatisch für die nächsten Schritte.</div>
        <button
          className="primary"
          type="button"
        onClick={() => {
          let ok = Boolean(status?.ok);
          try { if (!ok) ok = Boolean(sessionStorage.getItem('sb_ref_code')); } catch {}
          try {
            if (!ok && typeof document !== 'undefined') {
              const m = document.cookie.match(/(?:^|; )sb_ref=([^;]+)/);
              if (m) ok = true;
            }
          } catch {}
          if (!ok) {
            alert('Bitte gültigen Promo‑Code eingeben und aktivieren.');
            return;
          }
          try {
            sessionStorage.setItem('sb_ref_from_empfehlen', '1');
            sessionStorage.setItem('sb_ref_from_empfehlen_at', String(Date.now()));
          } catch {}
          try { window.location.assign('/start'); } catch {}
        }}
      >Jetzt starten</button>
      </section>

      {myCode && showMine ? (
        <section className="card share">
          <h2>Dein persönlicher Code</h2>
          <div className="code-box">{myCode}</div>
          <p>Teile den Link mit Freunden:</p>
          <div className="link-box">{shareLink}</div>
          <img
            className="qr"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareLink)}`}
            alt="QR-Code zum Teilen"
          />
        </section>
      ) : null}

      <style jsx>{`
        .ref-shell { min-height: 70vh; display: flex; justify-content: center; align-items: flex-start; padding: 28px; gap: 16px; flex-wrap: wrap; background: radial-gradient(1200px 520px at 10% 0%, #eef5ff 0%, #ffffff 60%); }
        .card {
          width: 100%;
          max-width: 700px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.06);
          padding: 16px;
        }
        .head{display:flex;justify-content:center}
        .logo{height:32px}
        .hero{display:flex;flex-direction:column;align-items:flex-start;background:linear-gradient(90deg,rgba(11,108,242,.08),rgba(11,108,242,.02));border:1px solid rgba(11,108,242,.18);border-radius:12px;padding:10px 12px;margin:8px 0 10px}
        h1 {
          margin: 6px 0 6px;
          font-weight: 900;
        }
        h2 {
          margin: 0 0 8px;
          font-weight: 900;
        }
        .sub {
          margin: 0 0 6px;
          color: #475569;
        }
        .ref-form {
          display: flex; gap: 10px; margin: 10px 0; align-items: center;
        }
        .code {
          flex: 1; height: 48px; border-radius: 12px; border: 1px solid #dbeafe; padding: 0 14px; font-size: 18px; box-shadow: 0 8px 22px rgba(11,108,242,.08);
        }
        .confirm { height: 48px; border-radius: 12px; border: 1px solid #0b6cf2; background: linear-gradient(135deg,#0b6cf2 0%,#3b82f6 100%); color: #fff; font-weight: 900; padding: 0 16px; box-shadow: 0 12px 28px rgba(11,108,242,.25); }
        .confirm::after{content:" 🔓"}
        .ok {
          color: #065f46;
          background: #ecfdf5;
          border: 1px solid #16a34a33;
          padding: 8px 10px;
          border-radius: 10px;
          margin-top: 8px;
          font-weight: 800;
        }
        .err {
          color: #991b1b;
          background: #fee2e2;
          border: 1px solid #ef444433;
          padding: 8px 10px;
          border-radius: 10px;
          margin-top: 8px;
          font-weight: 800;
        }
        .hint {
          margin-top: 10px;
          color: #64748b;
        }
        .primary {
          display: inline-flex;
          margin-top: 10px;
          align-items: center;
          height: 46px; padding: 0 16px; border-radius: 12px; border: 1px solid #16a34a; background: linear-gradient(135deg,#34d399 0%,#22c55e 100%); color: #fff; font-weight: 900; text-decoration: none; box-shadow: 0 10px 26px rgba(34,197,94,.28);
        }
        .primary::after{content:" 🚀"}
        .share {
          max-width: 360px;
          text-align: center;
        }
        .code-box {
          font-size: 24px;
          font-weight: 900;
          letter-spacing: 0.5px;
          background: #f7fafc;
          border: 1px solid #dbeafe;
          border-radius: 12px;
          padding: 12px;
          margin: 8px 0;
        }
        .link-box {
          font-size: 14px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px;
          word-break: break-all;
          margin-bottom: 12px;
        }
        .qr {
          width: 220px;
          height: 220px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          margin: 0 auto;
        }
      `}</style>
    </main>
  );
}
