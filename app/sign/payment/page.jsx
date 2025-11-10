"use client";

import { useEffect, useState } from "react";
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
        } catch {}
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
          setBilling((b) => ({
            ...b,
            billing_email: email || b.billing_email,
            billing_name: name || b.billing_name,
            billing_company: company || b.billing_company,
          }));
          if (email) setShowEmail(true);
        } catch {}
        try { order_id = sessionStorage.getItem("sb_order_id") || null; } catch {}
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
        } catch {}
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
      } catch {}
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
      } catch {}
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
      } catch {}
      setRedeemTried(true);
    })();
  }, [orderId, orderMeta?.discount_cents, promoInfo.code, redeemTried, billing?.billing_email]);

  // Clear referral indicators once wir die Zahlungsseite erreicht haben, damit Promo nicht dauerhaft aktiv bleibt

  useEffect(() => {
    if (promoInfo.code) return;
    try {
      let code = null;
      let discount = 0;
      try {
        const storedCode = sessionStorage.getItem("sb_ref_code");
        if (storedCode) code = storedCode;
        const storedDiscount = sessionStorage.getItem("sb_ref_discount");
        if (storedDiscount) discount = Number(storedDiscount) || 0;
      } catch {}
      if (typeof document !== "undefined" && !code) {
        const match = document.cookie.match(/(?:^|; )sb_ref=([^;]+)/);
        if (match) code = decodeURIComponent(match[1]);
      }
      if (code) {
        if (!discount) discount = 2500;
        setPromoInfo({ code: code.toUpperCase(), discount });
      }
    } catch {}
  }, [promoInfo.code]);

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
      <section className="hero">
        <div className="pill">Schritt 3 von 3 – Sicher abschließen</div>
        <h1>Jetzt sicher beauftragen – <span>Zahlung erst nach Löschung</span></h1>
        <p>Du hinterlegst dein Zahlungsmittel nur zur Autorisierung. Wir belasten erst nach bestätigtem Erfolg.</p>
        <ul className="hero-bullets">
          <li className="item">
            <div className="icon">💸</div>
            <div className="text">
              <div className="title">0 € Vorkasse</div>
              <div className="sub">Zahlung nach Erfolg</div>
            </div>
          </li>
          <li className="item">
            <div className="icon">🔒</div>
            <div className="text">
              <div className="title">Stripe‑Sicherheit</div>
              <div className="sub">3D‑Secure & Verschlüsselung</div>
            </div>
          </li>
          <li className="item">
            <div className="icon">✅</div>
            <div className="text">
              <div className="title">Fair & transparent</div>
              <div className="sub">Abbuchung erst nach Nachweis</div>
            </div>
          </li>
        </ul>
      </section>

      {/* Info-Grid bewusst entfernt für mehr Ruhe – Hauptbotschaft oben, Details unten im Trust-Block */}

      <section className="content-grid">
        <div className="summary-card compact">
          <header>
            <div>
              <p className="eyebrow">Rechnungsdaten</p>
              <h2>Rechnungsdaten (für deinen Löschbericht)</h2>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setEditBilling((v) => {
                  const next = !v;
                  if (next) setBillingDraft(billing);
                  return next;
                });
              }}
            >✏️</button>
          </header>
          {!editBilling ? (
            <ul className="details">
              <li><span>Name</span><strong>{billing.billing_name || "—"}</strong></li>
              <li><span>Firma</span><strong>{billing.billing_company || "—"}</strong></li>
              <li><span>E‑Mail</span><strong>{billing.billing_email || "—"}</strong></li>
              <li><span>Adresse</span><strong>{billing.billing_line1 || billing.billing_city || billing.billing_postal_code ? `${billing.billing_line1 || ""} ${billing.billing_postal_code || ""} ${billing.billing_city || ""} ${billing.billing_country || ""}`.trim() : "—"}</strong></li>
            </ul>
          ) : (
            <>
              <div className="billing-grid">
                <label>
                  <span>Vollständiger Name</span>
                  <input value={billingDraft?.billing_name || ""} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_name: e.target.value }))} placeholder="Max Mustermann" />
                </label>
                <label>
                  <span>Firma (optional)</span>
                  <input value={billingDraft?.billing_company || ""} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_company: e.target.value }))} placeholder="Firma GmbH" />
                </label>
                {showEmail ? (
                  <label className="span2">
                    <span>E‑Mail (optional)</span>
                    <input type="email" value={billingDraft?.billing_email || ""} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_email: e.target.value }))} placeholder="max@firma.de" />
                  </label>
                ) : null}
              </div>
              {!showEmail ? (
                <button type="button" className="stroke-btn" onClick={() => setShowEmail(true)}>+ E‑Mail hinzufügen (optional)</button>
              ) : null}
              {!showAddress ? (
                <button type="button" className="stroke-btn" onClick={() => setShowAddress(true)}>+ Adresse hinzufügen (optional)</button>
              ) : (
                <div className="billing-grid">
                  <label className="span2">
                    <span>Straße & Nr.</span>
                    <input value={billingDraft?.billing_line1 || ""} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_line1: e.target.value }))} placeholder="Musterstraße 1" />
                  </label>
                  <label>
                    <span>PLZ</span>
                    <input value={billingDraft?.billing_postal_code || ""} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_postal_code: e.target.value }))} placeholder="12345" />
                  </label>
                  <label>
                    <span>Ort</span>
                    <input value={billingDraft?.billing_city || ""} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_city: e.target.value }))} placeholder="Berlin" />
                  </label>
                  <label>
                    <span>Land</span>
                    <select value={billingDraft?.billing_country || "DE"} onChange={(e) => setBillingDraft((v) => ({ ...v, billing_country: e.target.value }))}>
                      <option value="DE">Deutschland</option>
                      <option value="AT">Österreich</option>
                      <option value="CH">Schweiz</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="row-actions">
                <button type="button" className="link-cancel" onClick={() => { setEditBilling(false); setBillingDraft(null); }}>Abbrechen</button>
                <button
                  type="button"
                  className="btn solid"
                  onClick={async () => {
                    if (billingDraft) setBilling(billingDraft);
                    try {
                      if (orderId && billingDraft) {
                        const name = (billingDraft.billing_name || "").trim();
                        const parts = name.split(/\s+/);
                        const first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : name || null;
                        const last_name = parts.length > 1 ? parts.slice(-1).join(" ") : null;
                        await fetch(`/api/orders/${orderId}/billing`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ...billingDraft,
                            email: billingDraft.billing_email || null,
                            first_name,
                            last_name,
                            company: billingDraft.billing_company || null,
                          }),
                        });
                      }
                    } catch {}
                    setEditBilling(false);
                  }}
                >Speichern</button>
              </div>
            </>
          )}

          {promoCode ? <div className="promo-chip">🎉 Promo aktiv: {promoCode}</div> : null}
          <div className="price-box">
            <div>Grundpreis <strong>{(basePrice / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</strong></div>
            {appliedDiscount ? (
              <div className="discount">Promo {promoCode}: −{(appliedDiscount / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</div>
            ) : null}
            <div className="sum">
              Zu zahlen nach Erfolg:
              {appliedDiscount ? (
                <>
                  <span className="old">{(basePrice / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                  <span className="arrow">→</span>
                </>
              ) : null}
              <span className="new">{(finalPrice / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
            </div>
          </div>
          <p className="note">Dein Zahlungsmittel bleibt nur hinterlegt – wir belasten erst nach bestätigtem Erfolg.</p>
          <p className="note small">Du erhältst automatisch eine Rechnung + Abschlussbericht.</p>
        </div>

        <div className="form-card">
          <header>
            <p className="eyebrow">Zahlungsmittel</p>
            <h2>Daten sicher hinterlegen</h2>
            <p className="sub action">Damit wir starten können, hinterlege jetzt dein Zahlungsmittel. Keine Abbuchung vor Erfolg.</p>
        </header>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe" },
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
          <div className="stripe-note"><span>🔐</span><p>Stripe (PCI‑konform) verwaltet dein Zahlungsmittel sicher. Belastung erst nach Erfolgsnachweis.</p></div>
        </div>
      </section>

      <section className="trust-block">
        <div className="trust-item"><span className="ico">✅</span><div><h4>Zahlung nach Erfolg</h4><p>Keine Vorkasse, kein Risiko.</p></div></div>
        <div className="trust-item"><span className="ico">🔒</span><div><h4>Sichere Stripe‑Verbindung</h4><p>3D‑Secure & Verschlüsselung.</p></div></div>
        <div className="trust-item"><span className="ico">📩</span><div><h4>Rechnung & Bericht</h4><p>Automatisch per E‑Mail.</p></div></div>
        <div className="trust-item"><span className="ico">💬</span><div><h4>Schneller Support</h4><p>Persönlich erreichbar.</p></div></div>
      </section>

      <section className="trust-logos">
        <div className="badge">🔒 SSL‑verschlüsselt</div>
        <div className="badge">💳 Stripe‑Zahlung</div>
        <div className="badge">🇩🇪 Made in Germany</div>
      </section>

      <style jsx>{`
        .pay-page{min-height:100vh;padding:32px 16px 80px;background:radial-gradient(circle at top,#eef2ff,#ffffff 45%)}
        .hero{max-width:820px;margin:0 auto 26px}
        .pill{display:inline-flex;padding:6px 14px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
        .hero h1{font-size:36px;margin:0;color:#0f172a;font-weight:900;line-height:1.15}
        .hero h1 span{color:#2563eb}
        .hero p{max-width:640px;color:#475569;margin:10px 0 16px;font-size:16px}
        .hero-bullets{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
        .hero-bullets .item{display:flex;gap:12px;align-items:center;border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 10px 26px rgba(15,23,42,.06)}
        .hero-bullets .icon{font-size:20px;line-height:1}
        .hero-bullets .text .title{font-weight:900;color:#0f172a}
        .hero-bullets .text .sub{font-size:13.5px;color:#64748b}

        /* Info-Grid entfernt */

        .content-grid{max-width:1000px;margin:0 auto 32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:22px}
        .summary-card,.form-card{background:#fff;border-radius:26px;border:1px solid rgba(15,23,42,.08);box-shadow:0 18px 48px rgba(15,23,42,.10);padding:20px}
        .summary-card.compact{padding:16px}
        .summary-card header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
        .eyebrow{margin:0;text-transform:uppercase;font-size:12px;letter-spacing:.2em;color:#94a3b8;font-weight:800}
        .summary-card h2{font-size:18px;margin:2px 0 0}
        .summary-card .details{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
        .summary-card .details li{padding:8px 10px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;display:flex;flex-direction:column}
        .summary-card .details span{font-size:11px;font-weight:800;color:#94a3b8}
        .summary-card .details strong{font-size:14px;color:#0f172a}
        .billing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 12px}
        .billing-grid .span2{grid-column:span 2}
        .billing-grid label span{font-size:12px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
        .billing-grid input,.billing-grid select{height:42px;border-radius:12px;border:1px solid #dfe7f5;padding:0 12px;font-size:14px}
        .stroke-btn{height:36px;border-radius:12px;border:1px solid #d0d7e8;background:#fff;font-weight:800;color:#0f172a;margin-bottom:10px}
        .row-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}
        .link-cancel{background:none;border:none;color:#64748b;font-weight:800;cursor:pointer}
        .link-cancel:hover{color:#0f172a}
        .btn{height:38px;border-radius:12px;padding:0 18px;font-weight:800;margin-left:auto}
        .btn.ghost{border:1px solid #d0d7e8;background:#fff;color:#0f172a}
        .btn.solid{border:1px solid #2563eb;background:#2563eb;color:#fff}
        .promo-chip{display:inline-flex;margin-top:16px;padding:6px 12px;border-radius:999px;background:#eef2ff;color:#1d4ed8;font-weight:800}
        .price-box{margin-top:18px;border-radius:18px;background:linear-gradient(135deg,#f8fafc,#ffffff);border:1px solid #e2e8f0;padding:18px;display:flex;flex-direction:column;gap:8px;font-weight:700;color:#0f172a}
        .price-box .sum{font-size:18px;font-weight:900;display:flex;align-items:center;gap:6px;color:#0f172a}
        .price-box .old{text-decoration:line-through;color:#94a3b8}
        .price-box .arrow{color:#2563eb;font-weight:900}
        .price-box .new{color:#0f172a}
        .note{margin-top:12px;color:#475569;font-weight:600}
        .note.small{font-size:13px;color:#94a3b8}

        .form-card header{margin-bottom:14px}
        .form-card .sub{color:#64748b;margin:4px 0 0}
        .form-card .sub.action{color:#334155;font-weight:700}
        .icon-btn{border:1px solid #e2e8f0;background:#fff;border-radius:12px;width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 10px 25px rgba(15,23,42,.1);cursor:pointer}
        .stripe-note{margin-top:16px;padding:12px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;display:flex;gap:10px;align-items:flex-start;color:#64748b;font-size:13px}
        .stripe-note span{font-size:18px}

        .trust-block{max-width:980px;margin:10px auto 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
        .trust-item{display:flex;gap:10px;align-items:flex-start;justify-content:center;text-align:left;border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 10px 26px rgba(15,23,42,.06)}
        .trust-item .ico{font-size:18px;line-height:1}
        .trust-item h4{margin:0 0 4px;color:#0f172a}
        .trust-item p{margin:0;color:#64748b;font-size:14px}

        .trust-logos{max-width:980px;margin:0 auto 20px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
        .trust-logos .badge{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;font-weight:800}

        @media(max-width:640px){
          .hero h1{font-size:30px}
          .hero p{font-size:14.5px}
          .hero-grid{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
          .row-actions{flex-direction:column}
          .btn{width:100%}
          .content-grid{grid-template-columns:1fr;gap:18px}
        }
      `}</style>
      <div className="page-cancel">
        <button className="link-cancel" type="button" onClick={() => { try { window.history.back(); } catch { try { window.location.assign('/sign'); } catch {} } }}>Abbrechen und zurück</button>
      </div>
    </main>
  );
}
