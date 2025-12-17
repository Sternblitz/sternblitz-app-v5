"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { SEO_DELIVERABLES } from "@/lib/seoDeliverables";

export const dynamic = "force-dynamic";

export default function SignPage() {
  const SEO_DOC_URL = "https://iexrsxsfqzxuafhblhhd.supabase.co/storage/v1/object/public/documents/AGB%20Sternblitz-SEO.pdf";
  const SEO_REP_KEY = "sb_seo_rep_code";
  const AGB_URL = SEO_DOC_URL;
  const PRIVACY_URL = SEO_DOC_URL;
  const STORAGE_KEY = "sb_seo_payload";
  const persist = (update = {}) => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY) || "{}";
      const current = JSON.parse(raw);
      const next = { ...current, ...update };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { }
  };
  const loadSeoRepCode = () => {
    try {
      if (typeof window === "undefined" || !window.sessionStorage) return null;
      const own = sessionStorage.getItem(SEO_REP_KEY);
      if (own) return own;
      const legacy = sessionStorage.getItem("sb_rep_code");
      return legacy || null;
    } catch {
      return null;
    }
  };
  // ===== Canvas (Signatur) =====
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // ===== Daten aus Step 1 =====
  const [summary, setSummary] = useState({
    googleProfile: "",
    googleUrl: "",
    company: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  // UI
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [editContact, setEditContact] = useState(false);

  // Drafts
  const formGoogleInputRef = useRef(null);
  const [googleField, setGoogleField] = useState("");
  const [contactDraft, setContactDraft] = useState({
    company: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [errors, setErrors] = useState({});
  const [repCode, setRepCode] = useState(null);
  const rememberRepCode = (code) => {
    const next = (code || "").trim();
    setRepCode(next || null);
    try {
      if (!next) {
        sessionStorage.removeItem(SEO_REP_KEY);
      } else {
        sessionStorage.setItem(SEO_REP_KEY, next);
      }
    } catch { }
  };
  // Remote share/prefill
  const [prefillToken, setPrefillToken] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareErr, setShareErr] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [showEmailShare, setShowEmailShare] = useState(false);
  const [shareToEmail, setShareToEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailErr, setEmailErr] = useState("");
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareLinkReady = Boolean(shareUrl);
  const safeShareUrl = shareLinkReady ? shareUrl : "";
  const [shareLocked, setShareLocked] = useState(false);
  const canShare = !shareLocked;

  // ===== Helpers =====
  // ===== Session laden =====
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
      const next = {
        googleProfile: stored?.googleProfile || "",
        googleUrl: stored?.googleUrl || "",
        company: stored?.company || "",
        firstName: stored?.firstName || "",
        lastName: stored?.lastName || "",
        email: stored?.email || "",
        phone: stored?.phone || "",
      };
      setSummary(next);
      setGoogleField(next.googleProfile || "");
      setContactDraft({
        company: next.company,
        firstName: next.firstName,
        lastName: next.lastName,
        email: next.email,
        phone: next.phone,
      });
      setRepCode(loadSeoRepCode());
    } catch { }
  }, []);

  // Prefill via share token (?t=...)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("t");
      if (!t) return;
      setShareLocked(true);
      setShowSharePanel(false);
      setShowEmailShare(false);
      (async () => {
        try {
          const res = await fetch(`/api/seo/prefill/${encodeURIComponent(t)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || "Prefill-Token ungültig");
          const p = json?.payload || {};
          const next = {
            googleProfile: p?.googleProfile || "",
            googleUrl: p?.googleUrl || "",
            company: p?.company || "",
            firstName: p?.firstName || "",
            lastName: p?.lastName || "",
            email: p?.email || "",
            phone: p?.phone || "",
          };
          setSummary(next);
          setGoogleField(next.googleProfile || "");
          setContactDraft({
            company: next.company,
            firstName: next.firstName,
            lastName: next.lastName,
            email: next.email,
            phone: next.phone,
          });
          if (json?.rep_code) rememberRepCode(json.rep_code);
          setPrefillToken(t);
          try { setShareToEmail(p?.email || ""); } catch { }
          persist(next);
        } catch (e) {
          console.warn("Prefill Fehler", e);
        }
      })();
    } catch { }
  }, []);


  // ===== Canvas Setup (responsive, präzise auf Touch) =====
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const setup = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = c.getBoundingClientRect();
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      c.width = cssW * ratio;
      c.height = cssH * ratio;
      const ctx = c.getContext("2d");
      // Reset Transform, dann sauber skalieren
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0f172a";
    };

    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, []);

  // ===== Google Places (Profil-Edit) =====
  const initPlaces = () => {
    try {
      const g = window.google;
      if (!g?.maps?.places || !formGoogleInputRef.current) return;
      const ac = new g.maps.places.Autocomplete(formGoogleInputRef.current, {
        types: ["establishment"],
        fields: ["name", "formatted_address", "url", "place_id"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace() || {};
        const name = place?.name || "";
        const address = place?.formatted_address || "";
        const url = place?.url || "";
        const fresh = [name, address].filter(Boolean).join(", ");
        setGoogleField(fresh);
        setSummary((s) => ({ ...s, googleProfile: fresh, googleUrl: url || "" }));
        persist({ googleProfile: fresh, googleUrl: url || "" });
      });
    } catch { }
  };

  const onPlacesLoad = () => {
    initPlaces();
  };

  useEffect(() => {
    if (editProfile) {
      loadGoogleMaps().then(() => initPlaces());
    }
  }, [editProfile]);

  // ===== Zeichnen =====
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };
  const move = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
  };
  const clearSig = () => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
  };

  // ===== Aktionen =====
  const saveContact = () => {
    setSummary((s) => ({ ...s, ...contactDraft }));
    persist(contactDraft);
    setEditContact(false);
  };

  // Erzeugt teilbaren Link (nur für interne Nutzer verfügbar)
  const createShareLink = async () => {
    if (shareLocked) return null;
    setShareErr("");
    setShareUrl("");
    setSharing(true);
    try {
      const activeRepCode = repCode || loadSeoRepCode();
      const payload = {
        googleProfile: summary.googleProfile,
        googleUrl: summary.googleUrl,
        company: summary.company,
        firstName: summary.firstName,
        lastName: summary.lastName,
        email: summary.email,
        phone: summary.phone,
      };
      const res = await fetch("/api/seo/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, rep_code: activeRepCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error || (res.status === 401 ? "Bitte zuerst einloggen, um einen Link zu erstellen." : "Fehler beim Erzeugen des Links");
        throw new Error(msg);
      }
      const url = json?.url || "";
      const token = json?.token || "";
      setShareUrl(url);
      setShareToken(token);
      setShowSharePanel(true);
      // Put in clipboard for convenience
      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { }
      return { url, token };
    } catch (e) {
      setShareErr(e?.message || "Unbekannter Fehler");
      try { alert(e?.message || "Fehler beim Erzeugen des Links"); } catch { }
      return null;
    } finally {
      setSharing(false);
    }
  };

  const sendShareEmail = async () => {
    if (shareLocked) return;
    setEmailErr("");
    setEmailSent(false);
    setEmailSending(true);
    try {
      const email = (shareToEmail || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte gültige E‑Mail angeben");
      // ensure we have a token
      let token = shareToken;
      if (!token) {
        const created = await createShareLink();
        token = created?.token || token || shareToken;
      }
      if (!token) throw new Error("Link konnte nicht erzeugt werden");
      const res = await fetch('/api/seo/prefill/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, to_email: email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'E-Mail Versand fehlgeschlagen');
      setEmailSent(true);
    } catch (e) {
      setEmailErr(e?.message || 'E-Mail Versand fehlgeschlagen');
    } finally {
      setEmailSending(false);
    }
  };

  // ===== Submit (PDF erzeugen + API call) =====
  const submit = async () => {
    // Inline Feld-Validierung (Kontakt)
    const errs = {};
    const emailOk = /^(?=[^@\s]{1,64}@)[^@\s]+@[^@\s]+\.[^@\s]+$/.test((summary.email || '').trim());
    const phoneDigits = String(summary.phone || '').replace(/\D/g, '');
    if (!(summary.company || '').trim() || (summary.company || '').trim().length < 2) errs.company = 'Bitte Firma angeben';
    if (!(summary.firstName || '').trim() || (summary.firstName || '').trim().length < 2) errs.firstName = 'Bitte Vorname (min. 2 Zeichen)';
    if (!(summary.lastName || '').trim() || (summary.lastName || '').trim().length < 2) errs.lastName = 'Bitte Nachname (min. 2 Zeichen)';
    if (!emailOk) errs.email = 'Bitte gültige E‑Mail angeben';
    if (phoneDigits.length < 6) errs.phone = 'Bitte gültige Telefonnummer angeben';
    if (Object.keys(errs).length) {
      setErrors(errs);
      setEditContact(true);
      try {
        document.querySelector('.with-bar.yellow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch { }
      return;
    }
    if (!agree) {
      alert("Bitte AGB & Datenschutz bestätigen.");
      return;
    }

    const c = canvasRef.current;
    const blank = document.createElement("canvas");
    blank.width = c.width;
    blank.height = c.height;
    if (c.toDataURL() === blank.toDataURL()) {
      alert("Bitte unterschreiben.");
      return;
    }

    setSaving(true);
    try {
      const signaturePng = c.toDataURL("image/png");

      const activeRepCode = repCode || loadSeoRepCode();

      const res = await fetch("/api/seo/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleProfile: summary.googleProfile,
          googleUrl: summary.googleUrl,
          company: summary.company,
          firstName: summary.firstName,
          lastName: summary.lastName,
          email: summary.email,
          phone: summary.phone,
          signaturePng,
          rep_code: activeRepCode,
          signLinkToken: prefillToken || null,
        }),
      });
      const raw = await res.text();
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (err) {
        if (!res.ok) throw new Error(raw || err?.message || "Serverfehler");
      }
      if (!res.ok) throw new Error(json?.error || "Unbekannter Fehler");

      alert("Auftragsbestätigung erteilt – bitte Zahlungsdaten hinterlegen, damit wir loslegen.");
      if (json?.redirect) {
        try { window.location.assign(json.redirect); } catch { }
      }
    } catch (e) {
      alert("Fehler: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };


  // Anzeige
  return (
    <main className="shell">

      <div className="page-container">
        {/* Action Bar (oben rechts) */}
        {canShare ? (
          <div className="action-bar">
            <div className="actions">
              <button type="button" className="btn share" onClick={() => { setShowSharePanel(true); createShareLink(); }} disabled={sharing}>
                <span className="emoji" aria-hidden>🔗</span>
                {sharing ? 'Erzeuge Link…' : 'Link teilen'}
              </button>
              <button type="button" className="btn email" onClick={() => { setShowEmailShare((v) => !v); if (!shareUrl) createShareLink(); }}>
                <span className="emoji" aria-hidden>✉️</span>
                Per E‑Mail senden
              </button>
            </div>
          </div>
        ) : null}

        {canShare && showEmailShare && (
          <section className="share-email">
            <label htmlFor="share-email-input">E‑Mail des Kunden</label>
            <div className="row">
              <input
                id="share-email-input"
                type="email"
                placeholder="z. B. kundin@firma.de"
                value={shareToEmail}
                onChange={(e) => setShareToEmail(e.target.value)}
              />
              <button type="button" className="btn send" onClick={sendShareEmail} disabled={emailSending}>
                {emailSending ? 'Sende…' : 'Senden'}
              </button>
            </div>
            {emailErr ? <div className="err-msg">{emailErr}</div> : null}
            {emailSent ? <div className="ok-msg">E‑Mail gesendet.</div> : null}
          </section>
        )}
        {/* HERO */}
        <section className="card card-hero">
          <div className="hero-head">
            <img
              className="logo"
              src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68ad4679902a5d278c4cf0bc_Group%202085662922-p-500.png"
              alt="Sternblitz"
            />
          </div>
          <h1>SEO-Auftragsbestätigung <b>Sternblitz</b></h1>
          <p className="lead">
            Monatlicher Fixpreis <b>99 €</b> · monatlich kündbar · keine Kündigungsfrist
          </p>
          <p className="lead">Im Leistungsumfang enthalten:</p>

          <div className="bullets">
            {SEO_DELIVERABLES.map(({ title, body }) => (
              <div key={title} className="bullet">
                <span className="tick">✅</span>
                <div>
                  <div className="bullet-title">{title}</div>
                  <div>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Share panel */}
        {canShare && showSharePanel ? (
          <section className="share-panel">
            <div className="share-head">
              <div className="title">Teilen</div>
              <button type="button" className="close" onClick={() => setShowSharePanel(false)} aria-label="Schließen">×</button>
            </div>
            <div className="share-row">
              <input className="share-input" readOnly value={shareUrl} placeholder={sharing ? 'Erzeuge Link…' : 'Noch kein Link'} onFocus={(e) => e.target.select()} />
              <button
                className="copy-btn"
                type="button"
                onClick={async () => {
                  try {
                    let link = shareUrl;
                    if (!link) {
                      const created = await createShareLink();
                      link = created?.url || link;
                    }
                    if (!link) return;
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch { }
                }}
              >
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
            <div className="share-actions">
              <a
                className={`wa ${shareLinkReady ? '' : 'disabled'}`}
                href={shareLinkReady ? `https://wa.me/?text=${encodeURIComponent('SEO-Auftragsbestätigung bitte unterschreiben: ' + safeShareUrl)}` : '#'}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => { if (!shareLinkReady) e.preventDefault(); }}
              >
                <span className="ico" aria-hidden>💬</span> WhatsApp
              </a>
              <a
                className={`mail ${shareLinkReady ? '' : 'disabled'}`}
                href={shareLinkReady ? `mailto:?subject=${encodeURIComponent('SEO-Auftragsbestätigung')}&body=${encodeURIComponent('Bitte unterschreiben:\n' + safeShareUrl)}` : '#'}
                onClick={(e) => { if (!shareLinkReady) e.preventDefault(); }}
              >
                <span className="ico" aria-hidden>✉️</span> E‑Mail
              </a>
            </div>
            {shareErr ? <div className="share-err">{shareErr}</div> : null}
          </section>
        ) : null}

        {/* GRID: Profil + Kontakt */}
        <section className="grid-2">
          {/* Google-Profil */}
          <div className="card with-bar green">
            <div className="bar">
              <span>Google-Profil</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setEditProfile((v) => !v);
                  setTimeout(() => formGoogleInputRef.current?.focus(), 30);
                }}
                title="Profil bearbeiten"
              >
                ✏️
              </button>
            </div>

            {!editProfile ? (
              <div className="content">
                <div className="value">{summary.googleProfile || "—"}</div>
                {summary.googleUrl ? (
                  <a className="open" href={summary.googleUrl} target="_blank" rel="noreferrer">Profil öffnen ↗</a>
                ) : null}
              </div>
            ) : (
              <div className="content">
                <input
                  ref={formGoogleInputRef}
                  type="search"
                  inputMode="search"
                  placeholder='Unternehmen suchen … z. B. "Restaurant XY, Berlin"'
                  value={googleField}
                  onChange={(e) => setGoogleField(e.target.value)}
                  className="text"
                />
                <div className="row-actions">
                  <button type="button" className="btn ghost" onClick={() => { setEditProfile(false); setGoogleField(summary.googleProfile || ""); }}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="btn solid"
                    onClick={() => {
                      setSummary((s) => ({ ...s, googleProfile: googleField }));
                      persist({ googleProfile: googleField, googleUrl: summary.googleUrl || "" });
                      setEditProfile(false);
                    }}
                  >
                    Speichern
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Kontakt-Übersicht */}
          <div className="card with-bar yellow">
            <div className="bar">
              <span>Kontakt-Übersicht</span>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setEditContact((v) => !v)}
                title="Kontaktdaten bearbeiten"
              >
                ✏️
              </button>
            </div>

            {!editContact ? (
              <div className="contact-grid readonly">
                <div><b>Firma:</b> {summary.company || "—"}</div>
                <div><b>Vorname:</b> {summary.firstName || "—"}</div>
                <div><b>Nachname:</b> {summary.lastName || "—"}</div>
                <div><b>E-Mail:</b> {summary.email || "—"}</div>
                <div><b>Telefon:</b> {summary.phone || "—"}</div>
              </div>
            ) : (
              <>
                <div className="contact-grid">
                  <label><span>Firma</span>
                    <input value={contactDraft.company} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, company: v })); setErrors((er) => ({ ...er, company: v.trim().length >= 2 ? null : 'Bitte Firma angeben' })); }} />
                    {errors.company ? <div className="err-msg">{errors.company}</div> : null}
                  </label>
                  <label><span>Vorname</span>
                    <input value={contactDraft.firstName} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, firstName: v })); setErrors((er) => ({ ...er, firstName: v.trim().length >= 2 ? null : 'Bitte Vorname (min. 2 Zeichen)' })); }} />
                    {errors.firstName ? <div className="err-msg">{errors.firstName}</div> : null}
                  </label>
                  <label><span>Nachname</span>
                    <input value={contactDraft.lastName} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, lastName: v })); setErrors((er) => ({ ...er, lastName: v.trim().length >= 2 ? null : 'Bitte Nachname (min. 2 Zeichen)' })); }} />
                    {errors.lastName ? <div className="err-msg">{errors.lastName}</div> : null}
                  </label>
                  <label><span>E-Mail</span>
                    <input type="email" value={contactDraft.email} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, email: v })); const ok = /^(?=[^@\s]{1,64}@)[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || '').trim()); setErrors((er) => ({ ...er, email: ok ? null : 'Bitte gültige E‑Mail angeben' })); }} />
                    {errors.email ? <div className="err-msg">{errors.email}</div> : null}
                  </label>
                  <label><span>Telefon</span>
                    <input value={contactDraft.phone} placeholder="+49 151 2345678" onChange={(e) => { let v = e.target.value; v = v.replace(/[^\d+\s]/g, ''); if (!v.startsWith('+')) { const digits = v.replace(/\D/g, ''); if (digits.startsWith('0')) v = '+49 ' + digits.replace(/^0+/, ''); else if (digits) v = '+49 ' + digits; else v = '+49 '; } setContactDraft((d) => ({ ...d, phone: v })); const ok = String(v || '').replace(/\D/g, '').length >= 6; setErrors((er) => ({ ...er, phone: ok ? null : 'Bitte gültige Telefonnummer angeben' })); }} />
                    {errors.phone ? <div className="err-msg">{errors.phone}</div> : null}
                  </label>
                </div>
                <div className="row-actions">
                  <button className="btn ghost" type="button" onClick={() => setEditContact(false)}>Abbrechen</button>
                  <button className="btn solid" type="button" onClick={saveContact}>Speichern</button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Signatur */}
        <section className="card signature">
          <div className="sig-head">
            <div className="sig-title">Unterschrift</div>
            <button type="button" className="icon-btn" onClick={clearSig} title="Unterschrift löschen">🗑️</button>
          </div>

          <div className="pad-wrap">
            <canvas
              ref={canvasRef}
              className="pad"
              onMouseDown={start}
              onMouseMove={move}
              onMouseUp={end}
              onMouseLeave={end}
              onTouchStart={start}
              onTouchMove={move}
              onTouchEnd={end}
            />
          </div>

          <label className="agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              Ich stimme den{" "}
              <a href={AGB_URL} target="_blank" rel="noopener noreferrer">AGB</a>{" "}
              und den{" "}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Datenschutzbestimmungen</a>{" "}
              zu.
            </span>
          </label>
        </section>

        {/* Submit-Button unter der Card, wie gewünscht */}
        <section className="actions center roomy">
          <button
            type="button"
            className="submit-btn next"
            onClick={submit}
            disabled={saving}
          >
            <span className="label">
              {saving ? "Wird gespeichert …" : "Unterschrift bestätigen"}
            </span>
            <span aria-hidden>✅</span>
          </button>
        </section>
      </div>

      {/* Styles */}
      <style jsx>{`
        .action-bar{display:flex;justify-content:flex-end;align-items:center;margin:6px 2px}
        .action-bar .actions{display:flex;gap:8px}
        .btn{height:36px;border-radius:999px;border:1px solid #e5e7eb;background:#f5f7fb;color:#0f172a;font-weight:900;padding:0 14px}
        .btn.share{background:#eef5ff;border-color:#dbeafe;color:#0b6cf2}
        .btn.email{background:#f5f5f7;border-color:#e5e7eb}
        .btn.send{background:#0b6cf2;border-color:#0b6cf2;color:#fff;min-width:150px;height:46px;justify-content:center;font-size:14px}
        .btn:disabled{opacity:.6}
        .emoji{filter: none}
        .share-email{border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:10px;margin:8px 0}
        .share-email .row{display:flex;gap:8px}
        .share-email input{flex:1;height:34px;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:6px 10px}
        .ok-msg{color:#166534;margin-top:8px;font-weight:800}
        .err-msg{color:#b91c1c;margin-top:8px}
        :root{
          --ink:#0f172a;
          --muted:#64748b;
          --line:#e5e7eb;
          --shadow:0 22px 60px rgba(2,6,23,.10);
          --shadow-soft:0 16px 36px rgba(2,6,23,.08);
          --green:#22c55e;
          --blue:#0b6cf2;
          --yellow:#FBBC05;
          --card:#ffffff;
        }
        /* Vollflächiger Hintergrund (wie Dashboard, dezenter Blau-Verlauf), auch unter der TopBar */
        .shell{
          min-height:100dvh;
          padding:14px 0 68px; /* TopNav fügt bereits 72px Spacer ein */
          display:flex;flex-direction:column;
          position:relative; z-index:0; background:transparent;
          overflow-x:hidden;
        }
        .shell::before{
          content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
          background:
            radial-gradient(900px 480px at 20% -10%, rgba(11,108,242,0.10) 0%, rgba(11,108,242,0.06) 30%, rgba(11,108,242,0.0) 60%),
            linear-gradient(180deg, #f8fbff 0%, #ffffff 55%, #ffffff 100%);
        }
        .page-container{
          width:min(920px, 100%);
          margin:0 auto;
          padding:20px 18px 40px;
          display:flex;
          flex-direction:column;
          gap:18px;
          box-sizing:border-box;
        }
        .card{
          width:100%;
          max-width:880px;
          background:var(--card);
          border:1px solid rgba(15,23,42,.08);
          border-radius:20px;
          box-shadow:var(--shadow);
          overflow:hidden;
          box-sizing:border-box;
        }
        .card-hero{
          text-align:left;
          padding:22px 22px 16px;
          background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,.88) 58%, #ffffff 100%);
          box-shadow: var(--shadow);
        }
        .hero-head{display:flex;justify-content:center}
        .logo{height:64px;width:auto;max-width:100%;object-fit:contain;filter: drop-shadow(0 4px 10px rgba(0,0,0,.10))}
        h1{margin:8px 0 6px;font-size:26px;color:#000;font-weight:900;text-align:center}
        .lead{margin:0 auto 12px;max-width:760px;color:var(--muted);text-align:center}
        .bullets{
          margin:10px auto 2px;
          max-width:760px;
          display:flex;flex-direction:column;gap:10px;
          align-items:stretch;
        }
        .bullet{
          display:flex;gap:10px;align-items:flex-start;justify-content:flex-start;
          background:#ffffff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;
          box-shadow: var(--shadow-soft);
          text-align:left;
        }
        .bullet-title{font-weight:900;color:#0f172a;margin-bottom:2px;font-size:15px}
        .tick{font-size:16px;line-height:1.2}
        .grid-2{
          display:flex;
          flex-direction:column;
          gap:16px;
          width:100%;
          max-width:880px;
          margin:0 auto;
          box-sizing:border-box;
        }
        .with-bar .bar{
          display:flex;align-items:center;justify-content:space-between;gap:10px;
          padding:8px 12px;font-weight:900;color:#0b0b0b;border-bottom:1px solid rgba(15,23,42,.06);
        }
        .with-bar.green .bar{background:linear-gradient(90deg, rgba(34,197,94,.22), rgba(34,197,94,.10));}
        .with-bar.yellow .bar{background:linear-gradient(90deg, rgba(251,188,5,.25), rgba(251,188,5,.10));}
        .with-bar .content{padding:12px 16px 16px}
        .with-bar .value{font-weight:900;color:#0a0a0a; overflow-wrap: anywhere;}
        .icon-btn{
          border:1px solid rgba(0,0,0,.08);background:#fff;border-radius:10px;min-width:30px;height:30px;
          display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
          box-shadow:0 6px 16px rgba(0,0,0,.06);
        }
        .icon-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(0,0,0,.08)}
        .text{
          width:100%;height:36px;border-radius:10px;border:1px solid rgba(0,0,0,.12);padding:6px 10px;
        }
        /* Edit-Aktionsleiste unten rechts, mit Luft und klarer Optik */
        .row-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:12px;padding:12px 16px 16px;border-top:1px solid rgba(15,23,42,.08);width:100%;flex-wrap:wrap;box-sizing:border-box}
        .row-actions .btn{min-width:120px}
        .btn{
          display:inline-flex;align-items:center;justify-content:center;
          border-radius:10px;height:34px;padding:0 16px;
          font-weight:800;font-size:14px;letter-spacing:.2px;cursor:pointer;
          transition:transform .15s ease, box-shadow .18s ease, background .18s ease;
          box-sizing:border-box;
        }
        .btn:active{transform:scale(.98)}
        .btn.ghost{
          border:1px solid rgba(15,23,42,.12);
          background:#fff;
          color:#0f172a;
          box-shadow:0 2px 8px rgba(15,23,42,.06);
        }
        .btn.ghost:hover{background:#f8fafc}
        .btn.solid{
          border:1px solid #0b6cf2;
          background:linear-gradient(135deg,#0b6cf2 0%,#3b82f6 100%);
          color:#fff;
          box-shadow:0 8px 20px rgba(11,108,242,.25);
        }
        .btn.solid:hover{filter:brightness(1.05);box-shadow:0 12px 26px rgba(11,108,242,.32)}
        .btn.full{width:100%;justify-content:center}
        .open{display:inline-flex;margin-top:6px;color:#0b6cf2;font-weight:800}
        .modal{
          position:fixed;inset:0;background:rgba(10,10,10,.25);
          display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;
        }
        .sheet{
          width:100%;max-width:420px;background:#fff;border:1px solid var(--line);
          border-radius:16px;box-shadow:0 28px 70px rgba(0,0,0,.18);padding:14px;
        }
        .sheet h3{margin:4px 6px 10px;font-size:18px}
        .option-list{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
        .opt{
          width:100%; text-align:left; border:1px solid #eaf0fe; background:#fff;
          padding:12px 14px; border-radius:12px; font-weight:800; cursor:pointer;
        }
        .opt:hover{background:#f6faff}
        .opt.on{background:#eef5ff;border-color:#0b6cf2}
        .contact-grid{display:grid;grid-template-columns:repeat(5, minmax(0,1fr));gap:12px;padding:12px 16px}
        .contact-grid.readonly{grid-template-columns:repeat(3, minmax(0,1fr))}
        .contact-grid label{display:flex;flex-direction:column;gap:6px}
        .contact-grid label input{height:34px;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:6px 10px}
        .err-msg{color:#b91c1c;font-size:12px;margin-top:2px}
        .contact-grid span{font-size:12px;color:var(--muted);font-weight:900;text-transform:uppercase;letter-spacing:.04em}
        .signature{padding:12px 16px 20px}
        .sig-head{display:flex;justify-content:space-between;align-items:center;padding:4px 2px 8px}
        .sig-title{font-size:16px;font-weight:900}
        .pad-wrap{border:1px dashed #cbd5e1;border-radius:16px;background:#fff;padding:12px;box-shadow:var(--shadow-soft)}
        .pad{width:100%;max-width:760px;height:260px;border:2px solid #e5e7eb;border-radius:12px;background:#fff;touch-action:none;margin:0 auto;display:block}
        .agree{display:flex;gap:10px;align-items:flex-start;margin:12px 2px 0;color:var(--ink)}
        .agree a{color:#0b6cf2;text-decoration:underline}
        .cta{display:flex;justify-content:center;margin-top:16px}
        .confirm{
          display:inline-flex;align-items:center;justify-content:center;gap:10px;
          padding:14px 22px;border-radius:999px;border:1px solid rgba(0,0,0,.16);
          background:linear-gradient(135deg, #dff6e9 0%, #c8efd9 100%);
          color:#0b0b0b;font-weight:900;letter-spacing:.2px;
          box-shadow:0 14px 34px rgba(34,197,94,.30);
          transition:transform .12s ease, box-shadow .18s ease, filter .18s ease;
        }
        .confirm:hover{transform:translateY(-1px);filter:brightness(1.03);box-shadow:0 18px 42px rgba(34,197,94,.38)}
        .confirm:active{transform:translateY(0);filter:brightness(.98)}
        .confirm:disabled{opacity:.6;cursor:not-allowed}
        @media (max-width:1000px){
          .grid-2{flex-direction:column}
          .contact-grid{grid-template-columns:repeat(2, minmax(0,1fr))}
          .contact-grid.readonly{grid-template-columns:repeat(2, minmax(0,1fr))}
          .pad{max-width:100%}
        }
        @media (max-width:640px){
          .page-container{padding:18px 16px 36px;gap:16px}
          .card-hero{padding:20px 18px 14px}
          .grid-2{gap:14px}
          .contact-grid{grid-template-columns:1fr}
          .contact-grid.readonly{grid-template-columns:1fr}
          .row-actions{justify-content:stretch;padding:12px 14px 14px;gap:10px}
          .row-actions .btn{width:100%}
        }
        @media (max-width:420px){
          .btn{height:32px;padding:0 14px;font-size:13.5px}
          .page-container{padding:16px 14px 32px}
          .card-hero{padding:20px 16px 12px}
        }
        .actions {
          display: flex;
          justify-content: center;
          margin-top: 22px;
        }
        .submit-btn.next {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 22px;
          border-radius: 999px;
          border: 1px solid #16a34a;
          background: linear-gradient(135deg, #34d399 0%, #22c55e 100%);
          color: #ffffff;
          font-weight: 800;
          letter-spacing: 0.2px;
          box-shadow: 0 12px 28px rgba(34, 197, 94, 0.35);
          transition: transform 0.12s, box-shadow 0.18s, filter 0.18s;
        }
        .submit-btn.next:hover {
          transform: translateY(-1px);
          filter: brightness(1.03);
          box-shadow: 0 16px 36px rgba(34, 197, 94, 0.45);
        }
        .submit-btn.next:active {
          transform: translateY(0);
          filter: brightness(0.98);
          box-shadow: 0 8px 18px rgba(34, 197, 94, 0.35);
        }
        .submit-btn.next:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .submit-btn.next .label { font-size: 16px; }
        .share-panel{background:#f7fafc;border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px;margin:10px 0}
        .share-row{display:flex;gap:8px}
        .share-input{flex:1;border:1px solid #dbeafe;border-radius:10px;height:34px;padding:6px 10px}
        .copy-btn{height:34px;border-radius:10px;border:1px solid #dbeafe;background:#eef5ff;color:#0b6cf2;font-weight:800;padding:0 10px}
        .share-actions{display:flex;gap:10px;margin-top:8px}
        .share-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px}
        .share-head .title{font-weight:900;color:#0f172a}
        .share-head .close{width:28px;height:28px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;cursor:pointer}
        .share-actions a{display:inline-flex;align-items:center;height:34px;border-radius:999px;padding:0 12px;font-weight:900;text-decoration:none}
        .share-actions .ico{margin-right:8px}
        .share-actions .wa{background:#dcfce7;color:#14532d;border:1px solid #bbf7d0}
        .share-actions .mail{background:#eef2ff;color:#1e3a8a;border:1px solid #dbeafe}
        .share-actions a.disabled{opacity:.5;pointer-events:none}
        .share-err{color:#b91c1c;margin-top:8px}
        .action-bar{display:flex;justify-content:flex-end;align-items:center;margin:8px 2px 2px}
        .action-bar .actions{display:flex;gap:8px}
        .btn{height:36px;border-radius:999px;border:1px solid #e5e7eb;background:#f5f7fb;color:#0f172a;font-weight:900;padding:0 14px;display:inline-flex;align-items:center}
        .btn .emoji{margin-right:8px}
        .btn.share{background:#eef5ff;border-color:#dbeafe;color:#0b6cf2}
        .btn.email{background:#f5f5f7;border-color:#e5e7eb}
        .btn.send{background:#0b6cf2;border-color:#0b6cf2;color:#fff}
        .btn:disabled{opacity:.6}
        .emoji{filter: none}
        .share-email{border:1px solid #e5e7eb;background:#fff;border-radius:16px;padding:14px 16px;margin:10px 0;box-shadow:0 8px 20px rgba(15,23,42,.04)}
        .share-email label{font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px;display:block}
        .share-email .row{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap}
        .share-email input{flex:1;min-width:220px;height:46px;border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:0 14px;font-size:15px}
        .ok-msg{color:#166534;margin-top:8px;font-weight:800}
        .err-msg{color:#b91c1c;margin-top:8px}
      `}</style>
    </main>
  );
}
