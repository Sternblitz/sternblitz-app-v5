"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { supabase as supabaseClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export default function SignPage() {
  // ===== Canvas (Signatur) =====
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // ===== Daten aus Step 1 =====
  const [summary, setSummary] = useState({
    googleProfile: "",
    googleUrl: "",
    selectedOption: "",
    counts: { c123: null, c12: null, c1: null },
    stats: { totalReviews: null, averageRating: null, breakdown: null },
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
  const [editOptionOpen, setEditOptionOpen] = useState(false);

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
  const [profileSource, setProfileSource] = useState({ name: "", address: "" });

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
    try {
      const p = JSON.parse(sessionStorage.getItem("sb_checkout_payload") || "{}");
      const counts = p?.counts || { c123: null, c12: null, c1: null };
      setSummary({
        googleProfile: p?.googleProfile || "",
        googleUrl: p?.googleUrl || "",
        selectedOption: p?.selectedOption || "",
        counts,
        stats: p?.stats || { totalReviews: null, averageRating: null, breakdown: null },
        company: p?.company || "",
        firstName: p?.firstName || "",
        lastName: p?.lastName || "",
        email: p?.email || "",
        phone: p?.phone || "",
      });
      setGoogleField(p?.googleProfile || "");
      setContactDraft({
        company: p?.company || "",
        firstName: p?.firstName || "",
        lastName: p?.lastName || "",
        email: p?.email || "",
        phone: p?.phone || "",
      });
      try {
        const src = JSON.parse(sessionStorage.getItem("sb_selected_profile") || "{}");
        setProfileSource({
          name: src?.name || "",
          address: src?.address || "",
        });
      } catch {}
    } catch {}
  }, []);

  // ===== Canvas Setup =====
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const cssW = 760; // etwas schmaler
    const cssH = 260;
    c.style.width = cssW + "px";
    c.style.height = cssH + "px";
    c.width = cssW * ratio;
    c.height = cssH * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
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
        setProfileSource({ name, address });
        try {
          const raw = sessionStorage.getItem("sb_checkout_payload") || "{}";
          const payload = JSON.parse(raw);
          payload.googleProfile = fresh;
          payload.googleUrl = url || "";
          sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
        } catch {}
      });
    } catch {}
  };

  const onPlacesLoad = () => {
    initPlaces();
  };

  useEffect(() => {
    if (editProfile) {
      const t = setTimeout(() => initPlaces(), 30);
      return () => clearTimeout(t);
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
    try {
      const raw = sessionStorage.getItem("sb_checkout_payload") || "{}";
      const payload = JSON.parse(raw);
      Object.assign(payload, contactDraft);
      sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
    } catch {}
    setEditContact(false);
  };

  const changeOption = (val) => {
    setSummary((s) => ({ ...s, selectedOption: val }));
    try {
      const raw = sessionStorage.getItem("sb_checkout_payload") || "{}";
      const payload = JSON.parse(raw);
      payload.selectedOption = val;
      sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
    } catch {}
    setEditOptionOpen(false);
  };

  // ===== Submit (PDF erzeugen + API call) =====
  const submit = async () => {
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

      // aktuell eingeloggter User (falls vorhanden)
      let sourceAccountId = null;
      try {
        const sb = supabaseClient();
        const { data } = await sb.auth.getUser();
        sourceAccountId = data?.user?.id || null;
      } catch {}

      // rep_code aus sessionStorage (setzt dein RepTracker)
      let repCode = null;
      try {
        repCode = sessionStorage.getItem("sb_rep_code") || null;
      } catch {}

      const res = await fetch("/api/sign/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleProfile: summary.googleProfile,
          googleUrl: summary.googleUrl,
          selectedOption: summary.selectedOption,
          company: summary.company,
          firstName: summary.firstName,
          lastName: summary.lastName,
          email: summary.email,
          phone: summary.phone,
          signaturePng,
          counts: summary.counts,        // 1–3 / 1–2 / 1 Stückzahl
          stats: summary.stats,
          statsSource: profileSource,
          rep_code: repCode,             // neu
          source_account_id: sourceAccountId, // neu
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unbekannter Fehler");

      alert("Auftragsbestätigung erstellt.");
      // Optional: router.push("/thanks")
    } catch (e) {
      alert("Fehler: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };


  // Anzeige
  const chosenLabel = optionLabel(summary.selectedOption);
  const chosenCount = optionCount(summary.selectedOption, summary.counts);
  const countText = fmtCount(chosenCount);

  return (
    <main className="shell">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={onPlacesLoad}
      />

      {/* HERO – schmaler */}
      <section className="card card-hero">
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
            <span>Fixpreis: <b>299 €</b> (einmalig)</span>
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
      </section>

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
                    setSummary((s) => ({ ...s, googleProfile: googleField }));
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
                    } catch {}
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
      {editOptionOpen && (
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
      )}

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
            <div><b>E-Mail:</b> {summary.email || "—"}</div>
            <div><b>Telefon:</b> {summary.phone || "—"}</div>
          </div>
        ) : (
          <>
            <div className="contact-grid">
              <label><span>Firma</span><input value={contactDraft.company} onChange={(e) => setContactDraft((d) => ({ ...d, company: e.target.value }))} /></label>
              <label><span>Vorname</span><input value={contactDraft.firstName} onChange={(e) => setContactDraft((d) => ({ ...d, firstName: e.target.value }))} /></label>
              <label><span>Nachname</span><input value={contactDraft.lastName} onChange={(e) => setContactDraft((d) => ({ ...d, lastName: e.target.value }))} /></label>
              <label><span>E-Mail</span><input type="email" value={contactDraft.email} onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))} /></label>
              <label><span>Telefon</span><input value={contactDraft.phone} onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))} /></label>
            </div>
            <div className="row-actions">
              <button className="btn ghost" type="button" onClick={() => setEditContact(false)}>Abbrechen</button>
              <button className="btn solid" type="button" onClick={saveContact}>Speichern</button>
            </div>
          </>
        )}
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
            <a href="/AGB.pdf" target="_blank" rel="noopener noreferrer">AGB</a>{" "}
            und den{" "}
            <a href="/Datenschutz.pdf" target="_blank" rel="noopener noreferrer">Datenschutzbestimmungen</a>{" "}
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

      {/* Styles */}
      <style jsx>{`
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
        /* Vollflächiger Hintergrund mit dem farbigen Verlauf (wie zuvor), auch unter der TopBar */
        .shell{
          min-height:100dvh;
          padding:14px 14px 68px; /* TopNav fügt bereits 72px Spacer ein */
          display:flex;flex-direction:column;gap:16px;align-items:center;
          position:relative; z-index:0; background:transparent;
        }
        .shell::before{
          content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
          background:
            radial-gradient(1200px 600px at 12% 0%, rgba(216,231,219,.95) 0%, rgba(216,231,219,.12) 60%),
            radial-gradient(1400px 700px at 100% 0%, rgba(52,140,255,.42) 0%, rgba(52,140,255,0) 65%),
            linear-gradient(180deg, #f3f9ff 0%, #ffffff 60%, #ffffff 100%);
        }
        .card{
          width:100%;
          max-width:880px;
          background:var(--card);
          border:1px solid rgba(15,23,42,.08);
          border-radius:20px;
          box-shadow:var(--shadow);
          overflow:hidden;
        }
        .card-hero{
          text-align:left;
          padding:22px 22px 16px;
          background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,.88) 58%, #ffffff 100%);
          box-shadow: var(--shadow);
        }
        .hero-head{display:flex;justify-content:center}
        .logo{height:64px;width:auto;object-fit:contain;filter: drop-shadow(0 4px 10px rgba(0,0,0,.10))}
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
        .tick{font-size:16px;line-height:1.2}
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:880px;width:100%}
        .with-bar .bar{
          display:flex;align-items:center;justify-content:space-between;gap:10px;
          padding:8px 12px;font-weight:900;color:#0b0b0b;border-bottom:1px solid rgba(15,23,42,.06);
        }
        .with-bar.blue .bar{background:linear-gradient(90deg, rgba(11,108,242,.18), rgba(11,108,242,.08));}
        .with-bar.green .bar{background:linear-gradient(90deg, rgba(34,197,94,.22), rgba(34,197,94,.10));}
        .with-bar.yellow .bar{background:linear-gradient(90deg, rgba(251,188,5,.25), rgba(251,188,5,.10));}
        .with-bar .content{padding:12px 14px 14px}
        .with-bar .value{font-weight:900;color:#0a0a0a}
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
        /* Edit-Aktionsleiste mittig, nicht am Eck */
        .row-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid rgba(15,23,42,.06);width:100%}
        .row-actions .btn{min-width:110px}
        .btn{border-radius:10px;height:32px;padding:0 12px;font-weight:900;letter-spacing:.2px;cursor:pointer}
        .btn.ghost{border:1px solid #cbd5e1;background:#fff;color:#111;box-shadow:0 2px 8px rgba(0,0,0,.04)}
        .btn.ghost:hover{background:#f8fafc}
        .btn.solid{border:1px solid #0b6cf2;background:#0b6cf2;color:#fff}
        
        .btn.ghost{border:1px solid var(--line);background:#fff}
        .btn.solid{border:1px solid #0b6cf2;background:#0b6cf2;color:#fff}
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
        .contact-grid{display:grid;grid-template-columns:repeat(5, minmax(0,1fr));gap:10px;padding:12px 14px}
        .contact-grid.readonly{grid-template-columns:repeat(3, minmax(0,1fr))}
        .contact-grid label{display:flex;flex-direction:column;gap:6px}
        .contact-grid label input{height:34px;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:6px 10px}
        .contact-grid span{font-size:12px;color:var(--muted);font-weight:900;text-transform:uppercase;letter-spacing:.04em}
        .signature{padding:12px 14px}
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
          .contact-grid{grid-template-columns:1fr 1fr}
          .contact-grid.readonly{grid-template-columns:1fr 1fr}
          .pad{max-width:100%}
        }
        @media (max-width:560px){
          .card{max-width:100%}
          .lead{max-width:100%}
          .contact-grid{grid-template-columns:1fr}
          .contact-grid.readonly{grid-template-columns:1fr}
          .row-actions{gap:8px}
        }

        /* Die Hero-Card hält immer einen Seitenabstand auf Mobile/kleineren Displays */
        /* Hero-Card zentriert; Seitenabstand kommt von .shell padding */
        .card-hero{ margin-left:auto; margin-right:auto }
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
      `}</style>
    </main>
  );
}
