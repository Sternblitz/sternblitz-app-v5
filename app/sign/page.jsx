"use client";

import { useEffect, useRef, useState } from "react";
import { supabase as supabaseClient } from "@/lib/supabaseClient";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { toast } from "sonner";

export const dynamic = "force-dynamic";

export default function SignPage() {
  const AGB_URL = process.env.NEXT_PUBLIC_AGB_URL || "/AGB.pdf";
  const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL || "/Datenschutz.pdf";
  // ===== Canvas (Signatur) =====
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // ===== Daten aus Step 1 =====
  const [summary, setSummary] = useState({
    googleProfile: "",
    googleUrl: "",
    googlePlaceId: "",
    selectedOption: "",
    counts: { c123: null, c12: null, c1: null },
    stats: { totalReviews: null, averageRating: null, breakdown: null },
    company: "",
    firstName: "",
    lastName: "",
    street: "",
    zip: "",
    city: "",
    email: "",
    phone: "",
    customDiscount: 0,
  });

  const [currentUser, setCurrentUser] = useState(null);

  // UI
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [editOptionOpen, setEditOptionOpen] = useState(false);

  // Drafts
  const formGoogleInputRef = useRef(null);
  const [googleField, setGoogleField] = useState("");
  const [contactDraft, setContactDraft] = useState({
    company: "",
    firstName: "",
    lastName: "",
    street: "",
    zip: "",
    city: "",
    email: "",
    phone: "",
  });
  const [profileSource, setProfileSource] = useState({ name: "", address: "" });
  const [promoInfo, setPromoInfo] = useState({ code: null, discount: 0 });
  const [errors, setErrors] = useState({});
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

  // Success State for robust mobile feedback
  const [success, setSuccess] = useState(false);

  // ===== Helpers =====
  const optionLabel = (opt) =>
    ({ "123": "1–3 ⭐", "12": "1–2 ⭐", "1": "1 ⭐", custom: "Individuell" }[opt] || "—");

  const optionCount = (opt, c) => {
    if (!c) return null;
    if (opt === "123") return c.c123;
    if (opt === "12") return c.c12;
    if (opt === "1") return c.c1;
    return null;
  };

  const fmtCount = (n) => (Number.isFinite(n) ? `→ ${Number(n).toLocaleString()} Bewertungen` : "→ —");

  // ===== Session laden =====
  useEffect(() => {
    // Maps laden für Recovery
    loadGoogleMaps();

    try {
      const p = JSON.parse(sessionStorage.getItem("sb_checkout_payload") || "{}");
      const counts = p?.counts || { c123: null, c12: null, c1: null };
      let next = {
        googleProfile: p?.googleProfile || "",
        googleUrl: p?.googleUrl || "",
        googlePlaceId: p?.googlePlaceId || "",
        selectedOption: p?.selectedOption || "",
        counts,
        stats: p?.stats || { totalReviews: null, averageRating: null, breakdown: null },
        company: p?.company || "",
        firstName: p?.firstName || "",
        lastName: p?.lastName || "",
        street: p?.street || "",
        zip: p?.zip || "",
        city: p?.city || "",
        email: p?.email || "",
        phone: p?.phone || "",
        customDiscount: Number(p?.customDiscount || 0),
      };
      // Fallback: Prefill from session (Simulator) if checkout payload is empty
      try {
        if (!next.googleProfile) {
          const rawSel = sessionStorage.getItem('sb_selected_profile') || '';
          if (rawSel) {
            const sel = JSON.parse(rawSel);
            const name = sel?.name || '';
            const address = sel?.address || '';
            const url = sel?.url || '';
            const gp = [name, address].filter(Boolean).join(', ');
            if (gp) {
              next.googleProfile = gp;
              next.googleUrl = url;
            }
          }
        }
        if (!next.selectedOption) {
          const opt = sessionStorage.getItem('sb_selected_option') || '';
          if (opt) next.selectedOption = opt;
        }
        // Fallback stats → counts
        if (!next.stats || !next.stats.breakdown) {
          const rawStats = sessionStorage.getItem('sb_stats') || '';
          if (rawStats) {
            const s = JSON.parse(rawStats);
            next.stats = s;
            if (s?.breakdown) {
              const b = s.breakdown;
              const c1 = b[1] || 0;
              const c12 = c1 + (b[2] || 0);
              const c123 = c12 + (b[3] || 0);
              next.counts = { c123, c12, c1 };
            }
          }
        }
      } catch { }
      setSummary(next);
      setGoogleField(next.googleProfile || "");
      setContactDraft({
        company: p?.company || "",
        firstName: p?.firstName || "",
        lastName: p?.lastName || "",
        street: p?.street || "",
        zip: p?.zip || "",
        city: p?.city || "",
        email: p?.email || "",
        phone: p?.phone || "",
      });
      try {
        const src = JSON.parse(sessionStorage.getItem("sb_selected_profile") || "{}");
        setProfileSource({
          name: src?.name || "",
          address: src?.address || "",
        });
      } catch { }
    } catch { }
  }, []);

  // Recovery: If Place ID is missing, try to find it via Client-Side Places API
  useEffect(() => {
    if (!summary.googleProfile || summary.googlePlaceId) return;

    const tryFind = () => {
      try {
        if (!window.google?.maps?.places) return;

        // Construct query from available data
        const queryParts = [summary.googleProfile];
        if (summary.street) queryParts.push(summary.street);
        if (summary.city) queryParts.push(summary.city);
        const query = queryParts.join(", ");

        const service = new window.google.maps.places.PlacesService(document.createElement('div'));
        service.findPlaceFromQuery({
          query,
          fields: ['place_id', 'name', 'formatted_address']
        }, (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
            const pid = results[0].place_id;
            if (pid) {
              console.log("Recovered Place ID:", pid);
              setSummary(s => ({ ...s, googlePlaceId: pid }));
            }
          }
        });
      } catch (e) {
        console.warn("Place ID recovery failed", e);
      }
    };

    if (window.google?.maps?.places) {
      tryFind();
    } else {
      // Wait for maps to load
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          tryFind();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [summary.googleProfile, summary.googlePlaceId, summary.street, summary.city]);

  // Check user session for UI restrictions
  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseClient();
        const { data } = await sb.auth.getUser();
        setCurrentUser(data?.user || null);
      } catch { }
    })();
  }, []);

  // Prefill via share token (?t=...)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("t");
      if (!t) return;
      (async () => {
        try {
          const res = await fetch(`/api/sign/prefill/${encodeURIComponent(t)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || "Prefill-Token ungültig");
          const p = json?.payload || {};
          const counts = p?.counts || { c123: null, c12: null, c1: null };
          const next = {
            googleProfile: p?.googleProfile || "",
            googleUrl: p?.googleUrl || "",
            selectedOption: p?.selectedOption || "",
            counts,
            stats: p?.stats || { totalReviews: null, averageRating: null, breakdown: null },
            company: p?.company || "",
            firstName: p?.firstName || "",
            lastName: p?.lastName || "",
            street: p?.street || "",
            zip: p?.zip || "",
            city: p?.city || "",
            email: p?.email || "",
            phone: p?.phone || "",
            customDiscount: Number(p?.customDiscount || 0),
          };
          setSummary(next);
          setGoogleField(next.googleProfile || "");
          setContactDraft({
            company: next.company,
            firstName: next.firstName,
            lastName: next.lastName,
            street: next.street,
            zip: next.zip,
            city: next.city,
            email: next.email,
            phone: next.phone,
          });
          if (json?.rep_code) rememberRepCode(json.rep_code);
          setPrefillToken(t);
        } catch (e) {
          console.warn("Prefill Fehler", e);
        }
      })();
    } catch { }
  }, []);

  // ===== Canvas Setup (High DPI) =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);

      // Set actual bitmap size
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      // Ensure style matches (optional, but keeps it explicit)
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  // ===== Zeichnen =====
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const start = (e) => {
    e.preventDefault(); // Prevent scrolling on touch
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
    const ctx = canvasRef.current.getContext("2d");
    ctx.closePath();
  };

  const clearSig = () => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    // Clear using the scaled dimensions logic or just clear huge rect
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to clear full buffer
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
  };

  // ===== Aktionen =====
  const saveContact = () => {
    setSummary((s) => ({ ...s, ...contactDraft }));
    setEditContact(false);
  };

  const rememberRepCode = (code) => {
    try {
      if (code) sessionStorage.setItem("sb_rep_code", code);
    } catch { }
  };

  const loadRepCode = () => {
    try {
      return sessionStorage.getItem("sb_rep_code") || null;
    } catch { return null; }
  };

  const createShareLink = async () => {
    setShareErr("");
    setShareUrl("");
    setSharing(true);
    try {
      const activeRepCode = loadRepCode();
      const payload = {
        googleProfile: summary.googleProfile,
        googleUrl: summary.googleUrl,
        googlePlaceId: summary.googlePlaceId,
        selectedOption: summary.selectedOption,
        counts: summary.counts,
        stats: summary.stats,
        company: summary.company,
        firstName: summary.firstName,
        lastName: summary.lastName,
        email: summary.email,
        phone: summary.phone,
        customDiscount: summary.customDiscount,
      };
      const res = await fetch("/api/sign/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, rep_code: activeRepCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Fehler beim Erzeugen des Links");
      const url = json?.url || "";
      const token = json?.token || "";
      setShareUrl(url);
      setShareToken(token);
      setShowSharePanel(true);
      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { }
      return { url, token };
    } catch (e) {
      setShareErr(e?.message || "Unbekannter Fehler");
      return null;
    } finally {
      setSharing(false);
    }
  };

  const sendShareEmail = async () => {
    setEmailErr("");
    setEmailSent(false);
    setEmailSending(true);
    try {
      const email = (shareToEmail || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte gültige E‑Mail angeben");
      let token = shareToken;
      if (!token) {
        const created = await createShareLink();
        token = created?.token || token || shareToken;
      }
      if (!token) throw new Error("Link konnte nicht erzeugt werden");
      const res = await fetch('/api/sign/prefill/email', {
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

  const submit = async () => {
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
      try { document.querySelector('.with-bar.yellow')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { }
      return;
    }
    if (!agree) {
      alert("Bitte AGB & Datenschutz bestätigen.");
      return;
    }
    const c = canvasRef.current;
    // Check if empty (simple check might fail with high DPI scaling, but let's try basic check)
    // A better check is tracking if user drew anything
    // For now, we assume if isDrawing was ever true or just rely on visual check
    // But toDataURL check vs blank is robust enough usually
    const blank = document.createElement("canvas");
    blank.width = c.width;
    blank.height = c.height;
    // Note: blank canvas won't have the scale transform, but toDataURL returns pixel data
    // If c was cleared with clearRect, it should match blank
    if (c.toDataURL() === blank.toDataURL()) {
      alert("Bitte unterschreiben.");
      return;
    }
    setSaving(true);
    try {
      const signaturePng = c.toDataURL("image/png");
      const activeRepCode = loadRepCode();
      const res = await fetch("/api/sign/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleProfile: summary.googleProfile,
          googleUrl: summary.googleUrl,
          googlePlaceId: summary.googlePlaceId,
          selectedOption: summary.selectedOption,
          counts: summary.counts,
          stats: summary.stats,
          company: summary.company,
          firstName: summary.firstName,
          lastName: summary.lastName,
          email: summary.email,
          phone: summary.phone,
          customDiscount: summary.customDiscount,
          signaturePng,
          rep_code: activeRepCode,
          signLinkToken: prefillToken || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Fehler beim Speichern");

      // Show robust success overlay
      setSuccess(true);
      toast.success("Auftragsbestätigung gespeichert.");

      // Redirect to Payment Page with Order ID
      setTimeout(() => {
        if (json.orderId) {
          window.location.href = `/sign/payment?order=${json.orderId}`;
        } else {
          window.location.href = "/sign/success";
        }
      }, 2000);
    } catch (e) {
      alert(e.message);
      setSaving(false);
    }
  };

  const changeOption = (val) => {
    setSummary(s => ({ ...s, selectedOption: val }));
    setEditOptionOpen(false);
  };

  const basePriceFormatted = formatEUR(BASE_PRICE_CENTS);
  const finalPriceFormatted = formatEUR(computeFinal(BASE_PRICE_CENTS, summary.customDiscount, promoInfo.discount));

  const chosenLabel = optionLabel(summary.selectedOption);
  const countVal = optionCount(summary.selectedOption, summary.counts);
  const countText = fmtCount(countVal);

  return (
    <main className="shell">
      {success && (
        <div className="success-overlay">
          <div className="success-card">
            <div className="icon">🎉</div>
            <h2>Auftrag bestätigt!</h2>
            <p>Wir leiten dich zur Zahlung weiter...</p>
            <div className="spinner"></div>
          </div>
        </div>
      )}

      <div className="page-container">
        {/* Share Action Bar (Restored) */}
        {!success && (
          <div className="action-bar">
            <div className="actions">
              <button
                type="button"
                className="btn share"
                onClick={async () => {
                  if (!shareLinkReady) await createShareLink();
                  setShowSharePanel(true);
                }}
              >
                <span className="emoji">🔗</span> Link teilen
              </button>
              <button
                type="button"
                className="btn email"
                onClick={() => setShowEmailShare((v) => !v)}
              >
                <span className="emoji">✉️</span> Als E-Mail
              </button>
            </div>
          </div>
        )}
        {
          showEmailShare && (
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
          )
        }
        {/* HERO */}
        < section className="card card-hero" >
          <div className="hero-head">
            <img
              className="logo"
              src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68ad4679902a5d278c4cf0bc_Group%202085662922-p-500.png"
              alt="Sternblitz"
            />
          </div>
          <h1>Auftragsbestätigung <b>Sternblitz</b></h1>
          <p className="lead">
            Hiermit bestätige ich den Auftrag zur Löschung meiner negativen Google-Bewertungen.
          </p>

          <div className="bullets">
            <div className="bullet">
              <span className="tick">✅</span>
              <span>
                {promoInfo.code || summary.customDiscount > 0 ? (
                  <b>
                    <span className="old">{basePriceFormatted}</span> <span className="arrow">→</span> <span className="new">{finalPriceFormatted}</span>
                  </b>
                ) : (
                  <b>{basePriceFormatted}</b>
                )}
                {promoInfo.code ? <span className="promo-note"> (Promo aktiv)</span> : (summary.customDiscount > 0 ? <span className="promo-note"> (Spezial-Rabatt)</span> : " (einmalig)")}
              </span>
            </div>
            <div className="bullet">
              <span className="tick">✅</span>
              <span>Zahlung erst nach Löschung (von mind. 90 % der Bewertungen)</span>
            </div>
            <div className="bullet">
              <span className="tick">✅</span>
              <span>Dauerhafte Entfernung</span>
            </div>
          </div>
        </section >

        {/* Share panel */}
        {
          showSharePanel ? (
            <section className="share-panel" >
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
                  href={shareLinkReady ? `https://wa.me/?text=${encodeURIComponent('Bitte unterschreiben: ' + safeShareUrl)}` : '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => { if (!shareLinkReady) e.preventDefault(); }}
                >
                  <span className="ico" aria-hidden>💬</span> WhatsApp
                </a>
                <a
                  className={`mail ${shareLinkReady ? '' : 'disabled'}`}
                  href={shareLinkReady ? `mailto:?subject=${encodeURIComponent('Auftragsbestätigung')}&body=${encodeURIComponent('Bitte unterschreiben:\n' + safeShareUrl)}` : '#'}
                  onClick={(e) => { if (!shareLinkReady) e.preventDefault(); }}
                >
                  <span className="ico" aria-hidden>✉️</span> E‑Mail
                </a>
              </div>
              {shareErr ? <div className="share-err" > {shareErr}</div> : null}
            </section >
          ) : null
        }

        {
          promoInfo.code ? (
            <section className="promo-banner">
              <div className="promo-line">🎉 Promo aktiv: {promoInfo.code}</div>
              <div className="promo-amount"><span className="old">{basePriceFormatted}</span> <span className="arrow">→</span> <span className="new">{finalPriceFormatted}</span></div>
              <div className="promo-sub">Dein Rabatt wird automatisch berücksichtigt.</div>
            </section>
          ) : null
        }

        {
          summary.customDiscount > 0 ? (
            <section className="promo-banner special">
              <div className="promo-line">🏷️ Spezial-Rabatt aktiv</div>
              <div className="promo-amount"><span className="old">{basePriceFormatted}</span> <span className="arrow">→</span> <span className="new">{finalPriceFormatted}</span></div>
              <div className="promo-sub">Ein individueller Rabatt wurde hinterlegt.</div>
            </section>
          ) : null
        }

        {/* GRID: Profil + Option */}
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
                      // Place ID zurücksetzen, damit Recovery läuft
                      setSummary((s) => ({ ...s, googleProfile: googleField, googlePlaceId: "" }));
                      const parts = (googleField || "").split(",");
                      const manualName = (parts.shift() || "").trim();
                      const manualAddress = parts.join(",").trim();
                      setProfileSource({
                        name: manualName,
                        address: manualAddress,
                      });
                      try {
                        const raw = sessionStorage.getItem("sb_checkout_payload") || "{}";
                        const payload = JSON.parse(raw);
                        payload.googleProfile = googleField;
                        sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
                      } catch { }
                      setEditProfile(false);
                    }}
                  >
                    Speichern
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Zu löschende Bewertungen */}
          <div className="card with-bar blue">
            <div className="bar">
              <span>Zu löschende Bewertungen</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditOptionOpen(true)}
                title="Bewertungs-Option ändern"
              >
                ✏️
              </button>
            </div>

            <div className="content">
              <div className="value">
                {chosenLabel} <span className="count">{countText}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Option-Auswahl (Modal) */}
        {
          editOptionOpen && (
            <div className="modal" onClick={() => setEditOptionOpen(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <h3>Option wählen</h3>
                <div className="option-list">
                  {[
                    ["123", "1–3 ⭐ löschen"],
                    ["12", "1–2 ⭐ löschen"],
                    ["1", "1 ⭐ löschen"],
                    ["custom", "Individuelle Löschungen"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={`opt ${summary.selectedOption === val ? "on" : ""}`}
                      onClick={() => changeOption(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn ghost full" type="button" onClick={() => setEditOptionOpen(false)}>
                  Schließen
                </button>
              </div>
            </div>
          )
        }

        {/* Kontakt-Übersicht – Google Gelb/Orange */}
        <section className="card with-bar yellow">
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
              <div style={{ gridColumn: "1/-1", marginTop: 4, marginBottom: 2, fontSize: 13, fontWeight: 800, color: "#64748b" }}>Rechnungsadresse</div>
              <div><b>Straße:</b> {summary.street || "—"}</div>
              <div><b>PLZ/Stadt:</b> {(summary.zip || "—") + " " + (summary.city || "")}</div>
              <div style={{ gridColumn: "1/-1", marginTop: 4, marginBottom: 2, fontSize: 13, fontWeight: 800, color: "#64748b" }}>Kommunikation</div>
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

                <div style={{ gridColumn: "1/-1", marginTop: 12, marginBottom: 4, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Rechnungsadresse</div>

                <label style={{ gridColumn: "1/-1" }}><span>Straße & Hausnummer</span>
                  <input value={contactDraft.street} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, street: v })); setErrors((er) => ({ ...er, street: v.trim().length >= 3 ? null : 'Bitte Straße angeben' })); }} />
                  {errors.street ? <div className="err-msg">{errors.street}</div> : null}
                </label>
                <label><span>PLZ</span>
                  <input value={contactDraft.zip} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, zip: v })); setErrors((er) => ({ ...er, zip: v.trim().length >= 3 ? null : 'Bitte PLZ angeben' })); }} />
                  {errors.zip ? <div className="err-msg">{errors.zip}</div> : null}
                </label>
                <label><span>Stadt</span>
                  <input value={contactDraft.city} onChange={(e) => { const v = e.target.value; setContactDraft((d) => ({ ...d, city: v })); setErrors((er) => ({ ...er, city: v.trim().length >= 2 ? null : 'Bitte Stadt angeben' })); }} />
                  {errors.city ? <div className="err-msg">{errors.city}</div> : null}
                </label>

                <div style={{ gridColumn: "1/-1", marginTop: 12, marginBottom: 4, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Kommunikation</div>

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
        </section>

        {/* Signatur */}
        <section className="card signature tour-sign-pad">
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
            className="submit-btn next tour-sign-submit"
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
      <style jsx> {`
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
        .promo-note{font-size:12px;color:#0b6cf2;margin-left:6px;font-weight:800}
        .promo-banner{margin:16px auto 0;max-width:760px;padding:14px;border-radius:16px;border:1px solid rgba(11,108,242,.22);background:linear-gradient(90deg,rgba(11,108,242,.12),rgba(59,130,246,.06));display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .promo-line{font-weight:900;color:#0b6cf2;font-size:16px}
        .promo-amount{font-weight:900;font-size:18px;color:#0f172a}
        .promo-sub{font-size:12.5px;color:#475569}
        .old{text-decoration:line-through;color:#64748b}
        .arrow{color:#0b6cf2;font-weight:900;margin:0 4px}
        .new{color:#0f172a;font-weight:900}
        .tick{font-size:16px;line-height:1.2}
        .grid-2{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
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
        .with-bar.blue .bar{background:linear-gradient(90deg, rgba(11,108,242,.18), rgba(11,108,242,.08));}
        .with-bar.green .bar{background:linear-gradient(90deg, rgba(34,197,94,.22), rgba(34,197,94,.10));}
        .with-bar.yellow .bar{background:linear-gradient(90deg, rgba(251,188,5,.25), rgba(251,188,5,.10));}
        .with-bar .content{padding:12px 16px 16px}
        .with-bar .value{font-weight:900;color:#0a0a0a; overflow-wrap: anywhere;}
        .with-bar .count{margin-left:8px;color:var(--blue);font-weight:900}
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
          .grid-2{grid-template-columns:1fr}
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
        .err-msg{color:#b91c1c;margin-top:8px}
        .success-overlay{
          position:fixed;inset:0;z-index:9999;
          background:rgba(255,255,255,.95);
          display:flex;align-items:center;justify-content:center;
          animation:fadeIn .3s ease forwards;
        }
        .success-card{
          background:#fff;padding:32px;border-radius:24px;
          text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.15);
          border:1px solid #e5e7eb;
          max-width:320px;width:100%;
        }
        .success-card .icon{font-size:48px;margin-bottom:16px}
        .success-card h2{margin:0 0 8px;color:#0f172a}
        .success-card p{color:#64748b;margin:0 0 24px}
        .spinner{
          width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#0b6cf2;
          border-radius:50%;margin:0 auto;animation:spin .8s linear infinite;
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style >
    </main>
  );
}
