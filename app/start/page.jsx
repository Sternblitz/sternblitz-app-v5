"use client";

import { useEffect, useRef, useState } from "react";
import { supabase as supabaseClient } from "@/lib/supabaseClient";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";
import LiveSimulator from "@/components/LiveSimulator";

export default function StartPage() {
  const [promo, setPromo] = useState({ code: null, discount: 0 });
  const [googleProfile, setGoogleProfile] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const gpInputRef = useRef(null);
  const [counts, setCounts] = useState({ c123: null, c12: null, c1: null });
  const updateCheckoutPartial = (patch = {}) => {
    try {
      const raw = sessionStorage.getItem("sb_checkout_payload") || "{}";
      const p = JSON.parse(raw);
      const selRaw = sessionStorage.getItem("sb_selected_profile") || "";
      let googleUrl = p.googleUrl || "";
      try { if (selRaw) { const sel = JSON.parse(selRaw); if (sel?.url) googleUrl = sel.url; } } catch {}
      const optRaw = sessionStorage.getItem("sb_selected_option") || "";
      const next = {
        ...p,
        googleProfile: patch.googleProfile ?? (p.googleProfile || ""),
        googleUrl,
        selectedOption: patch.selectedOption ?? (optRaw || p.selectedOption || ""),
        company: patch.company ?? (p.company || ""),
        firstName: patch.firstName ?? (p.firstName || ""),
        lastName: patch.lastName ?? (p.lastName || ""),
        email: patch.email ?? (p.email || ""),
        phone: patch.phone ?? (p.phone || ""),
      };
      sessionStorage.setItem("sb_checkout_payload", JSON.stringify(next));
    } catch {}
  };
  const [contact, setContact] = useState({
    company: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [editContact, setEditContact] = useState(false);
  const [warn, setWarn] = useState("");
  const canProceed = (() => {
    const okNames = (contact.firstName || "").trim().length >= 2 && (contact.lastName || "").trim().length >= 2;
    const okEmail = /^(?=[^@\s]{1,64}@)[^@\s]+@[^@\s]+\.[^@\s]+$/.test((contact.email || "").trim());
    const okProfile = Boolean((googleProfile || "").trim());
    const okOpt = Boolean((selectedOption || "").trim());
    return okNames && okEmail && okProfile && okOpt;
  })();

  useEffect(() => {
    (async () => {
      // If user is logged in (internal), never show promo on start
      try {
        const sb = supabaseClient();
        const { data } = await sb.auth.getUser();
        if (data?.user) {
          setPromo({ code: null, discount: 0 });
          return;
        }
      } catch {}
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
          setPromo({ code: code.toUpperCase(), discount });
        }
      } catch {}
    })();
  }, []);

  // Prefill from session (Simulator) if available
  useEffect(() => {
    try {
      const rawSel = sessionStorage.getItem("sb_selected_profile") || "";
      if (rawSel) {
        const sel = JSON.parse(rawSel);
        const name = sel?.name || "";
        const address = sel?.address || "";
        const gp = [name, address].filter(Boolean).join(", ");
        if (gp) setGoogleProfile(gp);
      }
    } catch {}
    try {
      const opt = sessionStorage.getItem("sb_selected_option") || "";
      if (opt && ["123","12","1"].includes(opt)) setSelectedOption(opt);
    } catch {}
  }, []);

  // Counts from stats (session or events)
  useEffect(() => {
    const compute = (s) => {
      const b = s?.breakdown || null;
      if (!b) return { c123: null, c12: null, c1: null };
      const c1 = b[1] || 0;
      const c12 = c1 + (b[2] || 0);
      const c123 = c12 + (b[3] || 0);
      return { c123, c12, c1 };
    };
    try {
      const raw = sessionStorage.getItem('sb_stats') || '';
      if (raw) {
        const s = JSON.parse(raw);
        setCounts(compute(s));
      }
    } catch {}
    const onStats = (e) => {
      const s = e?.detail || null;
      if (s) setCounts(compute(s));
    };
    try { window.addEventListener('sb:stats', onStats); } catch {}
    return () => { try { window.removeEventListener('sb:stats', onStats); } catch {} };
  }, []);

  // Init Google Places Autocomplete on the Google‑Profil input (when contact edit is open)
  const initPlacesStart = () => {
    try {
      const g = window.google;
      if (!g?.maps?.places || !gpInputRef.current) return;
      const ac = new g.maps.places.Autocomplete(gpInputRef.current, {
        types: ["establishment"],
        fields: ["name", "formatted_address", "url", "place_id"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace() || {};
        const name = place?.name || "";
        const address = place?.formatted_address || "";
        const url = place?.url || "";
        const fresh = [name, address].filter(Boolean).join(", ");
        setGoogleProfile(fresh);
        try {
          sessionStorage.setItem(
            "sb_selected_profile",
            JSON.stringify({ name, address, url })
          );
        } catch {}
        updateCheckoutPartial({ googleProfile: fresh });
      });
    } catch {}
  };

  useEffect(() => {
    if (editContact) {
      const t = setTimeout(() => initPlacesStart(), 50);
      return () => clearTimeout(t);
    }
  }, [editContact]);

  // Listen to profile events from LiveSimulator to sync profile field
  useEffect(() => {
    const onProfile = (e) => {
      const d = e?.detail || {};
      const fresh = [d?.name, d?.address].filter(Boolean).join(", ");
      if (fresh) {
        setGoogleProfile(fresh);
        updateCheckoutPartial({ googleProfile: fresh });
      }
    };
    const onOption = (e) => {
      const opt = e?.detail;
      if (opt && ["123","12","1"].includes(opt)) {
        setSelectedOption(opt);
        updateCheckoutPartial({ selectedOption: opt });
      }
    };
    try { window.addEventListener("sb:profile", onProfile); } catch {}
    try { window.addEventListener("sb:option-changed", onOption); } catch {}
    return () => {
      try { window.removeEventListener("sb:profile", onProfile); } catch {}
      try { window.removeEventListener("sb:option-changed", onOption); } catch {}
    };
  }, []);

  const baseCents = BASE_PRICE_CENTS;
  const finalCents = computeFinal(baseCents, promo.discount || 0);
  const baseStr = formatEUR(baseCents);
  const finalStr = formatEUR(finalCents);

  const isValidEmail = (v) => /^(?=[^@\s]{1,64}@)[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || "").trim());
  const isValidPhone = (v) => String(v || "").replace(/[^\d]/g, "").length >= 6; // mind. 6 Ziffern
  const isValid = () =>
    (contact.company || "").trim().length >= 2 &&
    (contact.firstName || "").trim().length >= 2 &&
    (contact.lastName || "").trim().length >= 2 &&
    isValidEmail(contact.email) &&
    isValidPhone(contact.phone);

  const proceed = () => {
    try {
      // persist current edits into session for downstream pages
      if (googleProfile) {
        try {
          const parts = googleProfile.split(",");
          const name = (parts.shift() || "").trim();
          const address = (parts.join(",") || "").trim();
          const sel = { name, address, url: "" };
          sessionStorage.setItem("sb_selected_profile", JSON.stringify(sel));
        } catch {}
      }
      if (selectedOption) {
        try { sessionStorage.setItem("sb_selected_option", selectedOption); } catch {}
      }
      const sel = JSON.parse(sessionStorage.getItem("sb_selected_profile") || "{}");
      const stats = JSON.parse(sessionStorage.getItem("sb_stats") || "{}");
      // Validate strictly against current state (not stale session)
      const optState = (selectedOption || "").trim();
      const gpState = (googleProfile || "").trim();
      const googleUrl = sel?.url || "";
      const counts = (() => {
        const b = stats?.breakdown || null;
        if (!b) return { c123: null, c12: null, c1: null };
        const c1 = b[1] || 0;
        const c12 = c1 + (b[2] || 0);
        const c123 = c12 + (b[3] || 0);
        return { c123, c12, c1 };
      })();
      if (!isValid() || !gpState || !optState) {
        const missing = [];
        if (!gpState) missing.push('Google‑Profil');
        if (!optState) missing.push('Option (1–3/1–2/1 Sterne)');
        if (!(contact.company || '').trim() || (contact.company || '').trim().length < 2) missing.push('Firma');
        if (!(contact.firstName || '').trim() || (contact.firstName || '').trim().length < 2) missing.push('Vorname');
        if (!(contact.lastName || '').trim() || (contact.lastName || '').trim().length < 2) missing.push('Nachname');
        if (!isValidEmail(contact.email)) missing.push('E‑Mail');
        if (!isValidPhone(contact.phone)) missing.push('Telefon');
        const msg = missing.length
          ? `Bitte fülle alle erforderlichen Felder aus: ${missing.join(', ')}.`
          : 'Bitte Felder ausfüllen.';
        alert(msg);
        setWarn(msg);
        setEditContact(true);
        try {
          const el = document.getElementById("start-contact");
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
          // Fokus auf das zuerst fehlende Feld
          let focusEl = null;
          if (!gpState) focusEl = document.querySelector('#start-contact input[name=googleProfile]');
          else if (!optState) focusEl = document.querySelector('#start-contact .seg-opt');
          else if (!(contact.company || '').trim() || (contact.company || '').trim().length < 2) focusEl = document.querySelector('#start-contact input[placeholder="Firma GmbH"]');
          else if (!(contact.firstName || '').trim() || (contact.firstName || '').trim().length < 2) focusEl = document.querySelector('#start-contact input[name=firstName]');
          else if (!(contact.lastName || '').trim() || (contact.lastName || '').trim().length < 2) focusEl = document.querySelector('#start-contact input[placeholder="Mustermann"]');
          else if (!isValidEmail(contact.email)) focusEl = document.querySelector('#start-contact input[type=email]');
          else if (!isValidPhone(contact.phone)) focusEl = document.querySelector('#start-contact input[type=tel]');
          if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
        } catch {}
        return;
      }

      const payload = {
        googleProfile: gpState,
        googleUrl,
        selectedOption: optState,
        counts,
        stats: stats?.breakdown ? {
          totalReviews: stats.totalReviews,
          averageRating: stats.averageRating,
          breakdown: stats.breakdown,
        } : { totalReviews: null, averageRating: null, breakdown: null },
        company: contact.company || "",
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || "",
        phone: contact.phone || "",
      };
      sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
    } catch {}
    try { window.location.assign("/sign"); } catch {}
  };

  return (
    <main className="start-shell">
      <section className="card hero">
        <div className="head">
          <img
            className="logo"
            src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68ad4679902a5d278c4cf0bc_Group%202085662922-p-500.png"
            alt="Sternblitz"
          />
        </div>
        <h1>Live‑Simulator & Auftrag starten</h1>
        <p className="lead">Sieh live, wie sich deine Sterne verbessern – starte danach deinen Auftrag in 2 Minuten.</p>
        {promo.code ? (
          <div className="promo">
            <div className="line">🎉 Promo aktiv: <b>{promo.code}</b></div>
            <div className="amount"><span className="old">{baseStr}</span> <span className="arrow">→</span> <span className="new">{finalStr} 💸</span></div>
            <div className="hint">Dein Rabatt wird automatisch berücksichtigt.</div>
          </div>
        ) : null}
        <ol className="steps">
          <li><span className="badge">1</span> 🏢 Unternehmen suchen</li>
          <li><span className="badge">2</span> ⭐ Option wählen (1–3/1–2/1)</li>
          <li><span className="badge">3</span> 📝 Kontaktformular ausfüllen</li>
          <li><span className="badge">4</span> ✍️ „Jetzt starten“: bestätigen & unterschreiben</li>
        </ol>
      </section>

      <section className="card">
        <LiveSimulator />
      </section>

      <section className="card contact-card">
        <div className="bar">
          <span>Kontakt</span>
          <button
            type="button"
            className="icon-btn"
            title={editContact ? "Schließen" : "Kontaktdaten bearbeiten"}
            onClick={() => setEditContact((v) => !v)}
          >
            {editContact ? "✓" : "✏️"}
          </button>
        </div>
        <div className="contact-box">
          {!editContact ? (
            <div id="start-contact" className="contact-grid readonly">
              <div><b>Google‑Profil:</b> {googleProfile || "—"}</div>
              <div>
                <b>Bewertungen:</b>{" "}
                {selectedOption === "123" ? "1–3 ⭐"
                  : selectedOption === "12" ? "1–2 ⭐"
                  : selectedOption === "1" ? "1 ⭐" : "—"}
                {(() => {
                  const n = selectedOption === '123' ? counts.c123 : selectedOption === '12' ? counts.c12 : selectedOption === '1' ? counts.c1 : null;
                  return Number.isFinite(n) ? (
                    <span className="count"> → {Number(n).toLocaleString('de-DE')}</span>
                  ) : null;
                })()}
              </div>
              <div><b>Firma:</b> {contact.company || "—"}</div>
              <div><b>Vorname:</b> {contact.firstName || "—"}</div>
              <div><b>Nachname:</b> {contact.lastName || "—"}</div>
              <div><b>E‑Mail:</b> {contact.email || "—"}</div>
              <div><b>Telefon:</b> {contact.phone || "—"}</div>
            </div>
          ) : (
            <div id="start-contact" className="lead-form">
              <div className="group">
                <div className="group-title">Google‑Profil</div>
                {warn && !googleProfile ? <div className="warn">{warn}</div> : null}
                <div className="field">
                  <label>Profil</label>
                  <div className="input-row">
                  <input
                    name="googleProfile"
                    type="text"
                    placeholder='z. B. "Restaurant XY, Berlin"'
                    ref={gpInputRef}
                    value={googleProfile}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGoogleProfile(v);
                      try {
                        const parts = v.split(',');
                        const name = (parts.shift() || '').trim();
                        const address = (parts.join(',') || '').trim();
                        const sel = { name, address, url: '' };
                        sessionStorage.setItem('sb_selected_profile', JSON.stringify(sel));
                      } catch {}
                      updateCheckoutPartial({ googleProfile: v });
                    }}
                  />
                  {googleProfile ? (
                    <button
                      type="button"
                      className="clear-btn"
                      aria-label="Profil löschen"
                      onClick={() => {
                        setGoogleProfile("");
                        try { sessionStorage.removeItem('sb_selected_profile'); } catch {}
                        updateCheckoutPartial({ googleProfile: "" });
                        gpInputRef.current?.focus();
                      }}
                    >×</button>
                  ) : null}
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="group-title">Zu löschende Bewertungen</div>
                {warn && !selectedOption ? <div className="warn">{warn}</div> : null}
                <div className="seg-options">
                  {[
                    { v: '123', label: '1–3 ⭐ löschen' },
                    { v: '12',  label: '1–2 ⭐ löschen' },
                    { v: '1',   label: '1 ⭐ löschen'  },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      className={`seg-opt ${selectedOption === o.v ? 'on' : ''}`}
                      onClick={() => {
                        setSelectedOption(o.v);
                        try { sessionStorage.setItem('sb_selected_option', o.v); } catch {}
                        updateCheckoutPartial({ selectedOption: o.v });
                        try { window.dispatchEvent(new CustomEvent('sb:option-changed', { detail: o.v })); } catch {}
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="group">
                <div className="group-title">Kontaktdaten</div>
                {warn ? <div className="warn">{warn}</div> : null}
                <div className="field">
                  <label>Firma</label>
                  <input type="text" placeholder="Firma GmbH" value={contact.company} onChange={(e) => { const v = e.target.value; setContact((c) => ({ ...c, company: v })); updateCheckoutPartial({ company: v }); }} />
                </div>
                <div className="row">
                  <div className="field half">
                    <label>Vorname <span className="req">*</span></label>
                    <input name="firstName" type="text" placeholder="Max" value={contact.firstName} onChange={(e) => { const v = e.target.value; setContact((c) => ({ ...c, firstName: v })); updateCheckoutPartial({ firstName: v }); }} />
                  </div>
                  <div className="field half">
                    <label>Nachname <span className="req">*</span></label>
                    <input type="text" placeholder="Mustermann" value={contact.lastName} onChange={(e) => { const v = e.target.value; setContact((c) => ({ ...c, lastName: v })); updateCheckoutPartial({ lastName: v }); }} />
                  </div>
                </div>
                <div className="row">
                  <div className="field half">
                    <label>E‑Mail <span className="req">*</span></label>
                    <input type="email" placeholder="max@firma.de" value={contact.email} onChange={(e) => { const v = e.target.value; setContact((c) => ({ ...c, email: v })); updateCheckoutPartial({ email: v }); }} />
                  </div>
                  <div className="field half">
                    <label>Telefon</label>
                    <input type="tel" placeholder="0151 2345678" value={contact.phone} onChange={(e) => { const v = e.target.value; setContact((c) => ({ ...c, phone: v })); updateCheckoutPartial({ phone: v }); }} />
                  </div>
                </div>
                <div className="actions">
                  <button className="btn ghost" type="button" onClick={() => { setWarn(""); setEditContact(false); }}>Fertig</button>
                  <button className="btn solid" type="button" onClick={() => { setWarn(""); setEditContact(false); }}>Speichern</button>
                </div>
              </div>
            </div>
          )}
          <div className="small-hint">Wir nutzen deine Angaben nur für Angebot, Vertrag & Rechnung.</div>
          <div className="cta">
            <button type="button" className="confirm" onClick={proceed}>
              Jetzt starten 🚀
            </button>
          </div>
        </div>
      </section>

      <style jsx>{`
        .start-shell{min-height:70vh;display:flex;flex-direction:column;gap:14px;align-items:center;padding:20px}
        .card{width:100%;max-width:980px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.06);padding:16px}
        .hero{max-width:980px}
        .head{display:flex;justify-content:center}
        .logo{height:36px}
        h1{margin:6px 0 6px;font-weight:900}
        .lead{margin:0 0 10px;color:#64748b}
        .promo{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:10px 0 4px;padding:12px;border:1px solid rgba(11,108,242,.22);border-radius:12px;background:linear-gradient(90deg,rgba(11,108,242,.12),rgba(59,130,246,.06));}
        .promo .line{font-weight:900;color:#0b6cf2}
        .promo .amount{font-weight:900}
        .promo .hint{color:#64748b}
        .steps{margin:10px 0 0 0;color:#0f172a;display:grid;grid-template-columns:1fr;gap:8px;list-style:none;padding:0}
        .steps .badge{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;border:1px solid #dbeafe;background:#eef5ff;color:#0a58c7;font-weight:900;margin-right:6px}
        .contact-card{padding:12px}
        .bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;font-weight:900;color:#0b0b0b;border:1px solid rgba(15,23,42,.06);border-radius:10px;background:linear-gradient(90deg,rgba(11,108,242,.08),rgba(11,108,242,.04));margin-top:4px}
        .contact-box{margin-top:8px;border:1px solid #e5e7eb;border-radius:12px;padding:12px 12px 14px;background:#fff}
        .contact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}
        .contact-grid.readonly{grid-template-columns:repeat(3,minmax(0,1fr))}
        .seg-options{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
        .seg-opt{border:1px solid #eaf0fe;background:#fff;padding:10px 12px;border-radius:12px;font-weight:800;cursor:pointer}
        .seg-opt.on{background:#eef5ff;border-color:#0b6cf2}
        .lead-form{padding:0}
        .group{margin-top:0}
        .group-title{font-family:"Outfit",sans-serif;font-weight:700;font-size:18px;color:#0f172a;margin-bottom:8px}
        .req{color:#e11d48;font-weight:800}
        .field{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        .field label{font-weight:600;color:#475569;font-size:13px}
        .field input{width:100%;height:34px;border-radius:10px;border:1px solid rgba(0,0,0,.12);padding:6px 10px;font-size:15px;background:#fff;transition:border-color .16s, box-shadow .16s;box-sizing:border-box}
        .input-row{position:relative;display:flex;align-items:center}
        .input-row .clear-btn{position:absolute;right:8px;height:28px;min-width:28px;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#fff;cursor:pointer;font-weight:900;line-height:1}
        .field input:focus{border-color:#0b6cf2;box-shadow:0 0 0 3px rgba(11,108,242,.2)}
        .count{margin-left:8px;color:#0b6cf2;font-weight:900}
        .row{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px}
        @media (max-width: 640px){ .row{grid-template-columns:1fr} }
        .half{min-width:0}
        .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}
        .btn{border-radius:10px;height:34px;padding:0 12px;font-weight:900;letter-spacing:.2px;cursor:pointer}
        .btn.ghost{border:1px solid #cbd5e1;background:#fff}
        .btn.solid{border:1px solid #0b6cf2;background:#0b6cf2;color:#fff}
        .warn{border:1px solid #ef444433;background:#fee2e2;color:#991b1b;padding:8px 10px;border-radius:10px;font-weight:800}
        .icon-btn{border:1px solid rgba(0,0,0,.08);background:#fff;border-radius:10px;min-width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.06)}
        .cta{display:flex;justify-content:center;margin-top:12px}
        .confirm{height:42px;border-radius:999px;border:1px solid #16a34a;background:#22c55e;color:#fff;font-weight:900;padding:0 18px}
        .confirm:disabled{opacity:.6;cursor:not-allowed}
        .small-hint{margin-top:8px;color:#64748b}
        .old{text-decoration:line-through;color:#64748b}
        .arrow{color:#0b6cf2;font-weight:900;margin:0 4px}
        .new{color:#0f172a;font-weight:900}
      `}</style>
    </main>
  );
}
