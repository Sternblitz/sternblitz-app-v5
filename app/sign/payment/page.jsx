"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

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
      // 1) Save billing to order (server persists + used for receipts later)
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
      // 2) Confirm SetupIntent (Stripe may trigger 3DS)
      const { error: err } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          // If 3DS/redirect is needed, Stripe handles it; stay on page after
          return_url: typeof window !== "undefined" ? window.location.href : undefined,
        },
        redirect: "if_required",
      });
      if (err) throw new Error(err.message || String(err));
      setOk(true);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (ok) {
    return (
      <div className="pay-shell">
        <h2>✅ Karte/SEPA gespeichert</h2>
        <p>Wir buchen erst nach erfolgreicher Löschung ab. Vielen Dank!</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="pay-form">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <div className="err">{error}</div> : null}
      <button className="confirm" type="submit" disabled={!stripe || submitting}>
        {submitting ? "Speichere…" : "Zahlungsmittel speichern"}
      </button>
      <style jsx>{`
        .pay-form{display:flex;flex-direction:column;gap:12px}
        .err{color:#b91c1c}
        .confirm{height:42px;border-radius:12px;border:1px solid #0b6cf2;background:#0b6cf2;color:#fff;font-weight:900}
      `}</style>
    </form>
  );
}

export default function PaymentPage() {
  const [clientSecret, setClientSecret] = useState("");
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [orderId, setOrderId] = useState("");
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

  useEffect(() => {
    (async () => {
      try {
        if (!PUBLISHABLE_KEY) {
          setFatal("Fehlende NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY Umgebungsvariable");
          setReady(true);
          return;
        }
        // Optional: pull customer email/name from last step or by order param
        let email = null, name = null, order_id = null, company = null;
        try {
          const raw = sessionStorage.getItem("sb_checkout_payload");
          const p = raw ? JSON.parse(raw) : {};
          email = p?.email || null;
          name = [p?.firstName, p?.lastName].filter(Boolean).join(" ") || null;
          company = p?.company || null;
          setBilling((b)=>({
            ...b,
            billing_email: email || b.billing_email,
            billing_name: name || b.billing_name,
            billing_company: company || b.billing_company,
          }));
        } catch {}
        try { order_id = sessionStorage.getItem('sb_order_id') || null; } catch {}
        // If order id provided in URL, prefer that (e.g., via QR from orders page)
        try {
          const url = new URL(window.location.href);
          const orderParam = url.searchParams.get('order');
          if (orderParam) {
            order_id = orderParam;
            // fetch minimal order info to prefill email/name
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
      } catch (e) {
        console.error(e);
        setFatal(e?.message || "Unbekannter Fehler beim Initialisieren");
        setReady(true);
      }
    })();
  }, []);

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
    <main className="pay-shell">
      {/* Trust-Hinweis */}
      <section className="card trust">
        <h1>🔒 Zahlung erst nach erfolgreicher Löschung</h1>
        <ul className="trust-list">
          <li>✅ Keine Vorauszahlung – heute nur Karte/SEPA hinterlegen</li>
          <li>🛡️ 3D‑Secure & Stripe‑Schutz (PCI‑konform)</li>
          
          <li>💶 299 € erst nach Löschung</li>
        </ul>
      </section>
      <section className="card">
        <h1>Zahlungsart hinterlegen</h1>
        <p className="sub">Wir belasten erst nach erfolgreicher Löschung.</p>
        {/* Rechnungsdaten (im Stil der Sign‑Seite) */}
        <div className="bar">
          <span>Rechnungsdaten</span>
          <button type="button" className="icon-btn" title="Rechnungsdaten bearbeiten" onClick={()=>{
            setEditBilling((v)=>{
              const next=!v; if(next) setBillingDraft(billing); return next;
            });
          }}>✏️</button>
        </div>
        {!editBilling ? (
          <div className="bill-view bill-box">
            <div><b>Name:</b> {billing.billing_name || "—"}</div>
            <div><b>Firma:</b> {billing.billing_company || "—"}</div>
            <div><b>E‑Mail:</b> {billing.billing_email || "—"}</div>
            <div><b>Adresse:</b> {billing.billing_line1 || billing.billing_city || billing.billing_postal_code ? (
              <span>{billing.billing_line1 || ""} {billing.billing_postal_code || ""} {billing.billing_city || ""} {billing.billing_country || ""}</span>
            ) : "—"}</div>
          </div>
        ) : (
          <>
            <div className="billing-grid bill-box">
              <label>
                <span>Name</span>
                <input value={billingDraft?.billing_name || ""} onChange={(e)=>setBillingDraft(v=>({...v,billing_name:e.target.value}))} placeholder="Max Mustermann" />
              </label>
              <label>
                <span>Firma (optional)</span>
                <input value={billingDraft?.billing_company || ""} onChange={(e)=>setBillingDraft(v=>({...v,billing_company:e.target.value}))} placeholder="Firma GmbH" />
              </label>
              <label>
                <span>E‑Mail</span>
                <input type="email" value={billingDraft?.billing_email || ""} onChange={(e)=>setBillingDraft(v=>({...v,billing_email:e.target.value}))} placeholder="max@firma.de" />
              </label>
            </div>
            {!showAddress ? (
              <button type="button" className="mini-btn add" onClick={()=>setShowAddress(true)}>+ Adresse hinzufügen (optional)</button>
            ) : (
              <div className="billing-grid bill-box">
                <label className="span2">
                  <span>Straße & Nr.</span>
                  <input value={billingDraft?.billing_line1 || ""} onChange={(e)=>setBillingDraft(v=>({...v,billing_line1:e.target.value}))} placeholder="Musterstraße 1" />
                </label>
                <label>
                  <span>PLZ</span>
                  <input value={billingDraft?.billing_postal_code || ""} onChange={(e)=>setBillingDraft(v=>({...v,billing_postal_code:e.target.value}))} placeholder="12345" />
                </label>
                <label>
                  <span>Ort</span>
                  <input value={billingDraft?.billing_city || ""} onChange={(e)=>setBillingDraft(v=>({...v,billing_city:e.target.value}))} placeholder="Berlin" />
                </label>
                <label>
                  <span>Land</span>
                  <select value={billingDraft?.billing_country || "DE"} onChange={(e)=>setBillingDraft(v=>({...v,billing_country:e.target.value}))}>
                    <option value="DE">Deutschland</option>
                    <option value="AT">Österreich</option>
                    <option value="CH">Schweiz</option>
                  </select>
                </label>
              </div>
            )}
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={()=>{ setEditBilling(false); setBillingDraft(null); }}>Abbrechen</button>
              <button type="button" className="btn solid" onClick={async()=>{
                if (billingDraft) setBilling(billingDraft);
                // optional sofort speichern
                try {
                  if (orderId && billingDraft) {
                    const name=(billingDraft.billing_name||"").trim(); const parts=name.split(/\s+/);
                    const first_name = parts.length>1?parts.slice(0,-1).join(" ") : name || null;
                    const last_name = parts.length>1?parts.slice(-1).join(" ") : null;
                    await fetch(`/api/orders/${orderId}/billing`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...billingDraft, email: billingDraft.billing_email || null, first_name, last_name, company: billingDraft.billing_company || null }) });
                  }
                } finally { setEditBilling(false); }
              }}>Speichern</button>
            </div>
          </>
        )}
        <h2 className="pay-head">Zahlungsmittel</h2>
        <Elements
          stripe={PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null}
          options={{ clientSecret, appearance: { theme: "stripe" }, defaultValues: { billingDetails: { name: billing.billing_name || undefined, email: billing.billing_email || undefined, address: { line1: billing.billing_line1 || undefined, city: billing.billing_city || undefined, postal_code: billing.billing_postal_code || undefined, country: billing.billing_country || undefined } } } }}
        >
          <PaymentForm orderId={orderId} billing={billing} />
        </Elements>
        <div className="hint">Die Angaben dienen der Rechnung & Stripe-Verifizierung. Zahlung erfolgt erst nach Erfolg.</div>
      </section>
      <style jsx>{`
        .pay-shell{min-height:70vh;display:flex;flex-direction:column;gap:14px;align-items:center;padding:20px}
        .card{width:100%;max-width:820px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.06);padding:16px}
        h1{margin:6px 0 2px;font-weight:900}
        .sub{margin:0 0 12px;color:#64748b}
        .trust h1{font-size:20px}
        .trust-list{margin:8px 0 0; padding-left:18px; color:#0f172a}
        .bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;font-weight:900;color:#0b0b0b;border:1px solid rgba(15,23,42,.06);border-radius:10px;background:linear-gradient(90deg, rgba(11,108,242,.18), rgba(11,108,242,.08));}
        .icon-btn{border:1px solid rgba(0,0,0,.08);background:#fff;border-radius:10px;min-width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.06)}
        .bill-box{border:1px solid #e5e7eb;border-radius:12px;background:linear-gradient(180deg,#ffffff 0%, #f9fbff 100%);box-shadow:0 8px 22px rgba(2,6,23,.05);padding:12px 14px; margin-top:10px}
        .bill-view{display:grid; grid-template-columns:1fr; gap:8px}
        .billing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0 14px}
        .billing-grid .span2{grid-column:span 2}
        label{display:flex;flex-direction:column;gap:6px}
        label span{font-size:12px;color:#64748b;font-weight:800}
        input, select{height:36px;border-radius:10px;border:1px solid #e5e7eb;padding:6px 10px;font-size:14px}
        .hint{margin-top:12px;color:#64748b}
        .mini-btn.add{height:34px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;font-weight:800}
        .row-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}
        .btn{border-radius:10px;height:34px;padding:0 12px;font-weight:900;letter-spacing:.2px;cursor:pointer}
        .btn.ghost{border:1px solid #cbd5e1;background:#fff}
        .btn.solid{border:1px solid #0b6cf2;background:#0b6cf2;color:#fff}
        .pay-head{margin:18px 0 8px;font-weight:900}
      `}</style>
    </main>
  );
}
