"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { BASE_PRICE_CENTS, computeFinal } from "@/lib/pricing";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase as supabaseClient } from "@/lib/supabaseClient";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

function PaymentForm({ orderId, billing }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    try {
      if (orderId && billing) {
        try {
          const name = (billing.billing_name || "").trim();
          const parts = name.split(/\s+/);
          const first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : name || null;
          const last_name = parts.length > 1 ? parts.slice(-1).join(" ") : null;
          await fetch(`/api/orders/${orderId}/billing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...billing,
              email: billing.billing_email || null,
              first_name,
              last_name,
              company: billing.billing_company || null,
            }),
          });
        } catch { }
      }
      const { error: err } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: typeof window !== "undefined" ? window.location.href : undefined,
        },
        redirect: "if_required",
      });
      if (err) throw new Error(err.message || String(err));
      setOk(true);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (ok) {
    return (
      <div className="form-finish">
        <div className="badge">✔︎ Gespeichert</div>
        <h3>Zahlungsmittel hinterlegt</h3>
        <p>Wir buchen erst nach der bestätigten Löschung ab.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="pay-form">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <div className="err">{error}</div> : null}
      <button className="confirm" type="submit" disabled={!stripe || submitting}>
        {submitting ? "Speichere…" : "Zahlungsmittel jetzt sicher hinterlegen"}
      </button>
      <p className="footnote">Stripe speichert deine Karte/SEPA nur zur Autorisierung. Belastung erst nach Erfolg.</p>
      <style jsx>{`
        .pay-form{display:flex;flex-direction:column;gap:16px}
        .err{color:#b91c1c;font-weight:700}
        .confirm{height:48px;border-radius:14px;border:none;background:linear-gradient(135deg,#0b6cf2 0%,#2563eb 100%);color:#fff;font-weight:900;font-size:15px;letter-spacing:.02em;box-shadow:0 12px 30px rgba(37,99,235,.35);cursor:pointer}
        .confirm:disabled{opacity:.6;cursor:not-allowed;box-shadow:none}
        .footnote{margin:2px 0 0;font-size:12px;color:#a3aec2;text-align:center}
        .form-finish{border:1px solid rgba(34,197,94,.3);background:#f0fdf4;border-radius:16px;padding:18px;text-align:center}
        .form-finish .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#bbf7d0;color:#0f5132;font-weight:800;margin-bottom:6px}
        .form-finish h3{margin:4px 0;color:#0f172a}
        .form-finish p{margin:0;color:#166534}
      `}</style>
    </form>
  );
}

export default function PaymentPage() {
  const [clientSecret, setClientSecret] = useState("");
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orderMeta, setOrderMeta] = useState(null);
  const [promoInfo, setPromoInfo] = useState({ code: null, discount: 0 });
  const [billing, setBilling] = useState({
    billing_name: "",
    billing_company: "",
    billing_email: "",
    billing_line1: "",
    billing_line2: "",
    billing_postal_code: "",
    billing_city: "",
    billing_country: "DE",
    billing_vat_id: "",
  });
  const [editBilling, setEditBilling] = useState(false);
  const [billingDraft, setBillingDraft] = useState(null);
  const [showAddress, setShowAddress] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [redeemTried, setRedeemTried] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!PUBLISHABLE_KEY) {
          setFatal("Fehlende NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY Umgebungsvariable");
          setReady(true);
          return;
        }
        let email = null, name = null, order_id = null, company = null;
        try {
          const raw = sessionStorage.getItem("sb_checkout_payload");
          const p = raw ? JSON.parse(raw) : {};
          email = p?.email || null;
          name = [p?.firstName, p?.lastName].filter(Boolean).join(" ") || null;
          company = p?.company || null;
          const street = p?.street || "";
          const zip = p?.zip || "";
          const city = p?.city || "";

          setBilling((b) => ({
            ...b,
            billing_email: email || b.billing_email,
            billing_name: name || b.billing_name,
            billing_company: company || b.billing_company,
            billing_line1: street || b.billing_line1,
            billing_postal_code: zip || b.billing_postal_code,
            billing_city: city || b.billing_city,
          }));
          if (email) setShowEmail(true);
          if (street || zip || city) setShowAddress(true);
        } catch { }
        try { order_id = sessionStorage.getItem("sb_order_id") || null; } catch { }
        try {
          const url = new URL(window.location.href);
          const orderParam = url.searchParams.get("order");
          if (orderParam) {
            order_id = orderParam;
            const r = await fetch(`/api/orders/${orderParam}`);
            const j = await r.json();
            if (r.ok && j?.order) {
              email = email || j.order.email || null;
              const nm = [j.order.first_name, j.order.last_name].filter(Boolean).join(" ") || null;
              name = name || nm;
              company = company || j.order.company || null;
              setBilling((b) => ({
                ...b,
                billing_email: email || b.billing_email,
                billing_name: nm || b.billing_name,
                billing_company: company || b.billing_company,
              }));
              if (email) setShowEmail(true);
              if (j.order.discount_cents) {
                setPromoInfo({ code: (j.order.referral_code || "").toUpperCase(), discount: j.order.discount_cents });
              }
            }
          }
        } catch { }
        if (order_id) setOrderId(order_id);
        const res = await fetch("/api/stripe/setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, order_id, metadata: company ? { company } : {} }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Stripe Fehler");
        setClientSecret(json?.client_secret || "");
        setReady(true);
      } catch (err) {
        console.error(err);
        setFatal(err?.message || "Unbekannter Fehler beim Initialisieren");
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    // If internal user is logged in, suppress promo on payment
    (async () => {
      try {
        const sb = supabaseClient();
        const { data } = await sb.auth.getUser();
        if (data?.user) {
          setPromoInfo({ code: null, discount: 0 });
          setRedeemTried(true);
        }
      } catch { }
    })();
    if (!orderId) return;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const json = await res.json();
        if (res.ok && json?.order) {
          setOrderMeta(json.order);
          if (json.order.discount_cents) {
            setPromoInfo({ code: (json.order.referral_code || "").toUpperCase(), discount: json.order.discount_cents });
          }
        }
      } catch { }
    })();
  }, [orderId]);

  // Falls der Auftrag noch keinen Rabatt hat, aber ein Promo-Code vorhanden ist,
  // versuche ihn (einmalig) auf den Auftrag anzuwenden und lade die Order neu.
  useEffect(() => {
    (async () => {
      if (!orderId || redeemTried) return;
      const code = (promoInfo.code || "").trim();
      if (!code) return;
      if (orderMeta?.discount_cents) { setRedeemTried(true); return; }
      try {
        const email = billing?.billing_email || orderMeta?.email || null;
        const r = await fetch("/api/referrals/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId, code, email }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok && j?.order) {
          setOrderMeta(j.order);
          if (j.order.discount_cents) {
            setPromoInfo({ code: (j.order.referral_code || code).toUpperCase(), discount: j.order.discount_cents });
          }
        }
      } catch { }
      setRedeemTried(true);
    })();
  }, [orderId, orderMeta?.discount_cents, promoInfo.code, redeemTried, billing?.billing_email]);

  // Clear referral indicators once wir die Zahlungsseite erreicht haben, damit Promo nicht dauerhaft aktiv bleibt

  useEffect(() => {
    if (promoInfo.code) return;
    let cancelled = false;
    (async () => {
      try {
        let code = null;
        let discount = 0;
        try {
          const storedCode = sessionStorage.getItem("sb_ref_code");
          if (storedCode) code = storedCode;
          const storedDiscount = sessionStorage.getItem("sb_ref_discount");
          if (storedDiscount) discount = Number(storedDiscount) || 0;
        } catch { }
        if (typeof document !== "undefined" && !code) {
          const match = document.cookie.match(/(?:^|; )sb_ref=([^;]+)/);
          if (match) code = decodeURIComponent(match[1]);
        }
        if (!code) return;
        if (!discount) {
          try {
            const res = await fetch("/api/referrals/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json?.discount_cents) {
              discount = Number(json.discount_cents) || 0;
              try { sessionStorage.setItem("sb_ref_discount", String(discount)); } catch { }
            }
          } catch { }
        }
        if (cancelled) return;
        setPromoInfo({ code: code.toUpperCase(), discount });
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [promoInfo.code]);

  useEffect(() => {
    const discount = Number(orderMeta?.discount_cents || 0);
    if (!discount) return;
    const code = (orderMeta?.referral_code || "").toString().toUpperCase();
    setPromoInfo({ code, discount });
  }, [orderMeta?.discount_cents, orderMeta?.referral_code]);

  const basePrice = BASE_PRICE_CENTS;
  const appliedDiscount = Math.max(
    Number(orderMeta?.discount_cents || 0),
    Number(promoInfo.discount || 0)
  );
  const computedFinal = computeFinal(basePrice, appliedDiscount);
  const finalPrice =
    (typeof orderMeta?.total_cents === "number" && Number(orderMeta?.discount_cents || 0) > 0)
      ? Math.max(0, Number(orderMeta.total_cents))
      : computedFinal;

  const promoCode = (promoInfo.code || orderMeta?.referral_code || "").toString().toUpperCase() || null;

  // (Promo-Aufräumen: zurück zur alten Logik – nicht automatisch hier löschen)

  if (!ready) return null;
  if (fatal) {
    return (
      <main className="pay-shell">
        <section className="card">
          <h1>Stripe Konfiguration unvollständig</h1>
          <p className="sub">{fatal}</p>
          <ul>
            <li>Setze <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> im Frontend</li>
            <li>Setze <code>STRIPE_SECRET_KEY</code> (Server)</li>
            <li>Für Webhooks lokal: <code>STRIPE_WEBHOOK_SECRET</code></li>
          </ul>
        </section>
        <style jsx>{`
          .pay-shell{min-height:70vh;display:flex;justify-content:center;align-items:flex-start;padding:20px}
          .card{width:100%;max-width:640px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.06);padding:16px}
          .sub{margin:0 0 12px;color:#64748b}
          ul{margin:0;padding-left:18px;color:#475569}
          code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:0 4px}
        `}</style>
      </main>
    );
  }
  if (!clientSecret) {
    return (
      <main className="pay-shell">
        <section className="card">
          <h1>Stripe nicht verfügbar</h1>
          <p className="sub">Konnte keinen SetupIntent erzeugen. Bitte später erneut versuchen.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pay-page">
      <div className="pay-bg-glow"></div>
      <div className="pay-container">

        {/* LEFT COLUMN: Trust & Timeline */}
        <section className="left-col">
          <div className="trust-hero">
            <div className="badge-pill">🛡️ 0,00 € Risiko</div>
            <h1>Zahlungsmittel sicher hinterlegen</h1>
            <p className="hero-sub">
              Keine Abbuchung heute. Du zahlst erst, wenn wir deine negativen Bewertungen erfolgreich gelöscht haben.
            </p>

            {/* Visual Timeline */}
            <div className="timeline-box">
              <div className="timeline-step active delay-1">
                <div className="step-icon">1</div>
                <div className="step-content">
                  <strong>Heute: 0,00 €</strong>
                  <p>Zahlungsmittel autorisieren</p>
                </div>
              </div>
              <div className="step-line delay-2"></div>
              <div className="timeline-step delay-3">
                <div className="step-icon">2</div>
                <div className="step-content">
                  <strong>Bearbeitung</strong>
                  <p>Wir löschen die Bewertung</p>
                </div>
              </div>
              <div className="step-line delay-4"></div>
              <div className="timeline-step success delay-5">
                <div className="step-icon">3</div>
                <div className="step-content">
                  <strong>Erfolg</strong>
                  <p>Zahlung erst nach Nachweis</p>
                </div>
              </div>
            </div>

            <ul className="trust-list">
              <li>
                <span className="icon">✅</span>
                <div>
                  <strong>Erst Erfolg, dann Zahlung</strong>
                  <p>Wir buchen erst ab, wenn die Löschung bestätigt ist.</p>
                </div>
              </li>
              <li>
                <span className="icon">🔒</span>
                <div>
                  <strong>Sichere Datenübertragung</strong>
                  <p>Deine Daten sind per 256-bit SSL verschlüsselt.</p>
                </div>
              </li>
              <li>
                <span className="icon">📄</span>
                <div>
                  <strong>Rechnung & Beleg</strong>
                  <p>Du erhältst automatisch eine Rechnung per E-Mail.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="summary-box">
            <h3>Zusammenfassung</h3>
            <div className="sum-row">
              <span>Grundpreis</span>
              <strong>{(basePrice / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</strong>
            </div>
            {appliedDiscount > 0 && (
              <div className="sum-row discount">
                <span>Rabatt {promoCode ? `(${promoCode})` : ""}</span>
                <strong>−{(appliedDiscount / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</strong>
              </div>
            )}
            <div className="divider"></div>
            <div className="sum-row total">
              <span>Fällig nach Erfolg:</span>
              <span className="amount">{(finalPrice / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
            </div>
            <div className="sum-row today-highlight pulse-animation">
              <span>Fällig heute:</span>
              <span className="amount-zero">0,00 €</span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Payment Form */}
        <section className="right-col">
          <div className="form-card glass-panel">
            <header>
              <h2>Zahlungsmethode</h2>
              <p>Wähle deine bevorzugte Zahlungsart. Dein Konto wird heute <u>nicht</u> belastet.</p>
            </header>

            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: '#4f46e5', // Indigo-600
                    borderRadius: '12px',
                    fontFamily: '"Outfit", sans-serif',
                    spacingUnit: '5px',
                  }
                },
                defaultValues: {
                  billingDetails: {
                    name: billing.billing_name || undefined,
                    email: billing.billing_email || undefined,
                    address: {
                      line1: billing.billing_line1 || undefined,
                      city: billing.billing_city || undefined,
                      postal_code: billing.billing_postal_code || undefined,
                      country: billing.billing_country || undefined,
                    },
                  },
                },
              }}
            >
              <PaymentForm orderId={orderId} billing={billing} />
            </Elements>

            <div className="secure-footer">
              <span className="lock">🔒</span>
              <p>Sichere SSL-Verbindung. Zertifiziert durch Stripe.</p>
            </div>
          </div>

          <div className="billing-summary">
            <div className="head">
              <span>Rechnungsdaten</span>
              <button onClick={() => setEditBilling(!editBilling)}>Bearbeiten</button>
            </div>
            {!editBilling ? (
              <p>
                {billing.billing_company && <>{billing.billing_company}<br /></>}
                {billing.billing_name}<br />
                {billing.billing_line1}<br />
                {billing.billing_postal_code} {billing.billing_city}
              </p>
            ) : (
              <div className="edit-hint">
                Bitte kontaktiere den Support für Änderungen oder nutze den "Bearbeiten" Button oben (vereinfacht).
              </div>
            )}
            {editBilling && (
              <div className="mini-edit">
                <input placeholder="Name" value={billing.billing_name} onChange={e => setBilling({ ...billing, billing_name: e.target.value })} />
                <input placeholder="Straße" value={billing.billing_line1} onChange={e => setBilling({ ...billing, billing_line1: e.target.value })} />
                <div className="row">
                  <input placeholder="PLZ" value={billing.billing_postal_code} onChange={e => setBilling({ ...billing, billing_postal_code: e.target.value })} />
                  <input placeholder="Ort" value={billing.billing_city} onChange={e => setBilling({ ...billing, billing_city: e.target.value })} />
                </div>
                <button className="save-btn" onClick={() => setEditBilling(false)}>Speichern</button>
              </div>
            )}
          </div>

          <div className="qr-section">
            <button className="qr-toggle" onClick={() => setShowQr(!showQr)} type="button">
              <span style={{ fontSize: '18px' }}>📱</span>
              <span>{showQr ? "Schließen" : "Am Smartphone bezahlen"}</span>
            </button>
            {showQr && (
              <div className="qr-card">
                <div className="qr-header">
                  <h3>Mobil weiterzahlen</h3>
                  <p>Scanne den Code, um deine Zahlungsdaten sicher auf deinem Handy einzugeben.</p>
                </div>
                <div className="qr-frame">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? (orderId ? `${window.location.origin}/sign/payment?order=${orderId}` : window.location.href)
                        : ''
                    )}`}
                    alt="QR Code"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

      </div>

      <div className="page-footer-nav">
        <Link href="/dashboard" className="back-link">
          ← Zur Startseite zurückgehen
        </Link>
      </div>

      <style jsx>{`
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); transform: scale(1); }
          70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); transform: scale(1); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes growLine {
          from { width: 0; opacity: 0; }
          to { width: 100%; opacity: 1; }
        }

        .pay-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
          padding: 60px 20px;
          font-family: 'Outfit', sans-serif;
          position: relative;
          overflow: hidden;
        }
        .pay-bg-glow {
          position: absolute;
          top: -30%;
          right: -10%;
          width: 900px;
          height: 900px;
          background: radial-gradient(circle, rgba(79, 70, 229, 0.08) 0%, rgba(255,255,255,0) 70%);
          z-index: 0;
          pointer-events: none;
        }
        .pay-container {
          max-width: 1140px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 480px;
          gap: 80px;
          align-items: start;
          position: relative;
          z-index: 1;
        }

        /* LEFT COL */
        .trust-hero { margin-bottom: 40px; }
        .badge-pill {
          display: inline-block;
          background: #d1fae5;
          color: #065f46;
          font-weight: 800;
          font-size: 13px;
          padding: 8px 16px;
          border-radius: 99px;
          margin-bottom: 20px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
          border: 1px solid #a7f3d0;
        }
        h1 {
          font-size: 48px;
          line-height: 1.05;
          color: #1e1b4b; /* Dark Indigo */
          margin: 0 0 20px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .hero-sub {
          font-size: 20px;
          color: #475569;
          line-height: 1.6;
          margin-bottom: 48px;
          font-weight: 400;
        }

        /* TIMELINE */
        .timeline-box {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 50px;
          position: relative;
          padding: 12px;
        }
        .timeline-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          width: 100px;
          position: relative;
          z-index: 2;
          opacity: 0;
          animation: fadeInUp 0.6s ease forwards;
        }
        .timeline-step.delay-1 { animation-delay: 0.1s; }
        .timeline-step.delay-3 { animation-delay: 0.3s; }
        .timeline-step.delay-5 { animation-delay: 0.5s; }

        .step-icon {
          width: 40px;
          height: 40px;
          background: #fff;
          border: 2px solid #e2e8f0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: #94a3b8;
          margin-bottom: 12px;
          transition: all 0.3s ease;
          font-size: 16px;
        }
        @keyframes pulse-blue {
          0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); transform: scale(1); }
          70% { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); transform: scale(1.1); }
          100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); transform: scale(1); }
        }

        .timeline-step.active .step-icon {
          border-color: #4f46e5;
          background: #4f46e5;
          color: #fff;
          box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.15);
          animation: pulse-blue 2s infinite;
        }
        .timeline-step.success .step-icon {
          border-color: #10b981;
          color: #10b981;
          background: #ecfdf5;
        }
        .step-content strong {
          display: block;
          font-size: 14px;
          color: #1e293b;
          margin-bottom: 4px;
        }
        .step-content p {
          font-size: 12px;
          color: #64748b;
          line-height: 1.3;
          margin: 0;
        }
        .step-line {
          flex: 1;
          height: 2px;
          background: #e2e8f0;
          margin-top: 20px;
          margin-left: -20px;
          margin-right: -20px;
          z-index: 1;
          opacity: 0;
          animation: growLine 0.6s ease forwards;
        }
        .step-line.delay-2 { animation-delay: 0.2s; }
        .step-line.delay-4 { animation-delay: 0.4s; }

        .trust-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .trust-list li {
          display: flex;
          gap: 18px;
          align-items: flex-start;
        }
        .trust-list .icon {
          font-size: 22px;
          background: #fff;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.04);
          border: 1px solid #f1f5f9;
        }
        .trust-list strong {
          display: block;
          color: #1e293b;
          font-size: 17px;
          margin-bottom: 4px;
          font-weight: 700;
        }
        .trust-list p {
          margin: 0;
          color: #64748b;
          font-size: 15px;
          line-height: 1.5;
        }

        .summary-box {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.9);
          border-radius: 20px;
          padding: 28px;
          margin-top: 50px;
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05);
        }
        .summary-box h3 { margin: 0 0 20px; font-size: 16px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
        .sum-row { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 16px; color: #475569; }
        .sum-row.discount { color: #16a34a; }
        .divider { height: 1px; background: #e2e8f0; margin: 20px 0; }
        .sum-row.total { font-weight: 700; color: #1e293b; font-size: 17px; }

        .sum-row.today-highlight {
          background: #ecfdf5;
          margin: 12px -12px -12px;
          padding: 16px 20px;
          border-radius: 12px;
          align-items: center;
          border: 1px solid #a7f3d0;
        }
        .sum-row.today-highlight.pulse-animation {
          animation: pulse-glow 3s infinite;
        }
        .sum-row.today-highlight span:first-child { font-weight: 700; color: #047857; }
        .amount-zero { color: #059669; font-weight: 900; font-size: 24px; }

        /* RIGHT COL */
        .glass-panel {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(24px);
          border-radius: 28px;
          box-shadow:
            0 25px 50px -12px rgba(79, 70, 229, 0.1),
            0 0 0 1px rgba(255, 255, 255, 0.6) inset;
          padding: 40px;
          border: 1px solid #e2e8f0;
          transition: transform 0.3s ease;
        }
        .glass-panel:hover {
          transform: translateY(-2px);
          box-shadow:
            0 30px 60px -15px rgba(79, 70, 229, 0.15),
            0 0 0 1px rgba(255, 255, 255, 0.6) inset;
        }
        .form-card header { margin-bottom: 32px; text-align: center; }
        .form-card h2 { margin: 0 0 10px; font-size: 24px; color: #1e1b4b; font-weight: 800; }
        .form-card p { margin: 0; color: #64748b; font-size: 15px; }

        .secure-footer {
          margin-top: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          color: #94a3b8;
          background: #f8fafc;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid #f1f5f9;
        }

        .billing-summary {
          margin-top: 32px;
          padding: 0 16px;
        }
        .billing-summary .head { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        .billing-summary button { background: none; border: none; color: #4f46e5; cursor: pointer; font-size: 13px; font-weight: 600; transition: color 0.2s; }
        .billing-summary button:hover { color: #4338ca; }
        .billing-summary p { font-size: 15px; color: #475569; line-height: 1.6; }

        .mini-edit { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        .mini-edit input { padding: 10px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; transition: border-color 0.2s; }
        .mini-edit input:focus { border-color: #4f46e5; outline: none; }
        .mini-edit .row { display: flex; gap: 10px; }
        .save-btn { background: #1e1b4b; color: #fff; border: none; padding: 10px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; transition: background 0.2s; }
        .save-btn:hover { background: #312e81; }

        .qr-section {
          margin-top: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .qr-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.6);
          border: 1px solid #e2e8f0;
          padding: 10px 24px;
          border-radius: 99px;
          color: #64748b;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }
        .qr-toggle:hover {
          background: #fff;
          color: #4f46e5;
          border-color: #c7d2fe;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1);
        }
        .qr-card {
          margin-top: 20px;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255, 0.8);
          border-radius: 24px;
          padding: 24px;
          text-align: center;
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08);
          animation: fadeInUp 0.4s ease-out;
          max-width: 300px;
          width: 100%;
        }
        .qr-header h3 {
          margin: 0 0 4px;
          font-size: 16px;
          color: #1e293b;
          font-weight: 700;
        }
        .qr-header p {
          margin: 0 0 20px;
          font-size: 13px;
          color: #64748b;
          line-height: 1.4;
        }
        .qr-frame {
          background: #fff;
          padding: 12px;
          border-radius: 18px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.04);
          display: inline-block;
        }
        .qr-frame img {
          display: block;
          width: 180px;
          height: 180px;
          border-radius: 4px;
        }

        .page-footer-nav {
          margin-top: 60px;
          text-align: center;
          position: relative;
          z-index: 10;
        }
        .back-link {
          color: #64748b;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
          padding: 10px 20px;
          border-radius: 99px;
          background: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.6);
        }
        .back-link:hover {
          color: #1e293b;
          background: rgba(255,255,255,0.8);
        }

        @media (max-width: 1000px) {
          .pay-container { grid-template-columns: 1fr; gap: 50px; }
          .left-col { order: 1; }
          .right-col { order: 2; }
          h1 { font-size: 36px; }
          .timeline-box { overflow-x: auto; padding-bottom: 10px; }
          .timeline-step { min-width: 90px; }
        }
      `}</style>
    </main>
  );
}
