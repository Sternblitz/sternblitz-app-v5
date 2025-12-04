"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LiveSimulator from "../../components/LiveSimulator";
import { supabase as supabaseClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const router = useRouter();

  const [formOpen, setFormOpen] = useState(false);
  const [blast, setBlast] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeDiscount, setActiveDiscount] = useState(0);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log("User found:", user.id);
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        console.log("Profile check:", profile, error);

        if (profile?.role === "ADMIN" || profile?.role === "admin") {
          console.log("User is admin");
          setIsAdmin(true);
        } else {
          console.log("User is NOT admin");
        }
      } else {
        console.log("No user logged in");
      }
    };
    checkAdmin();
  }, []);

  const [option, setOption] = useState("123"); // "123" | "12" | "1" | "custom"

  // Google-Profil (Form-Feld, editierbar)
  const formGoogleInputRef = useRef(null);
  const [googleField, setGoogleField] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");

  // Stats für Labels (vom Simulator)
  const [counts, setCounts] = useState({ c123: null, c12: null, c1: null });
  const [stats, setStats] = useState({
    totalReviews: null,
    averageRating: null,
    breakdown: null,
  });

  // Kontaktdaten
  const [company, setCompany] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Individuelle Wünsche
  const [customNotes, setCustomNotes] = useState("");

  const formRef = useRef(null);
  const scrollToForm = () =>
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const computeCounts = (stats) => {
    const b = stats?.breakdown || {};
    const c1 = b[1] || 0;
    const c12 = c1 + (b[2] || 0);
    const c123 = c12 + (b[3] || 0);
    return { c123, c12, c1 };
  };

  // Session ziehen
  const pullLatest = () => {
    try {
      const raw = sessionStorage.getItem("sb_selected_profile");
      if (raw) {
        const p = JSON.parse(raw);
        setGoogleField([p?.name || "", p?.address || ""].filter(Boolean).join(", "));
        setGoogleUrl(p?.url || "");
      }
      const statsRaw = sessionStorage.getItem("sb_stats");
      if (statsRaw) {
        const parsed = JSON.parse(statsRaw);
        setStats({
          totalReviews: Number(parsed?.totalReviews ?? null),
          averageRating: typeof parsed?.averageRating === "number" ? parsed.averageRating : null,
          breakdown: parsed?.breakdown || null,
        });
        setCounts(computeCounts(parsed));
      }
      const opt = sessionStorage.getItem("sb_selected_option");
      if (opt) setOption(opt);
      const disc = sessionStorage.getItem("sb_custom_discount");
      if (disc) setActiveDiscount(Number(disc));
    } catch { }
  };

  // Events vom Simulator (ohne auto-öffnen)
  useEffect(() => {
    const onSimStart = (e) => {
      const { name = "", address = "", url = "" } = e.detail || {};
      setGoogleField([name, address].filter(Boolean).join(", "));
      setGoogleUrl(url || "");
    };
    const onOpt = () => {
      const opt = sessionStorage.getItem("sb_selected_option");
      if (opt) setOption(opt);
    };
    const onStats = (e) => {
      const s = e.detail || {};
      sessionStorage.setItem("sb_stats", JSON.stringify(s));
      setStats({
        totalReviews: s.totalReviews,
        averageRating: s.averageRating,
        breakdown: s.breakdown
      });
      setCounts(computeCounts(s));
    };

    const onFillForm = (e) => {
      const d = e.detail || {};
      setCompany(d.company || "");
      setFirstName(d.firstName || "");
      setLastName(d.lastName || "");
      setStreet(d.street || "");
      setZip(d.zip || "");
      setCity(d.city || "");
      setEmail(d.email || "");
      setPhone(d.phone || "");

      // Update session payload for checkout
      try {
        const raw = sessionStorage.getItem("sb_checkout_payload") || "{}";
        const payload = JSON.parse(raw);
        Object.assign(payload, d);
        sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
      } catch { }
    };

    window.addEventListener("sb:simulator-start", onSimStart);
    window.addEventListener("sb:option-changed", onOpt);
    window.addEventListener("sb:stats", onStats);
    window.addEventListener("sb:fill-form", onFillForm);

    pullLatest();

    return () => {
      window.removeEventListener("sb:simulator-start", onSimStart);
      window.removeEventListener("sb:option-changed", onOpt);
      window.removeEventListener("sb:stats", onStats);
      window.removeEventListener("sb:fill-form", onFillForm);
    };
  }, []);

  // Keine Namensabfrage – Begrüßung bleibt schlicht „Hallo 👋“

  // EIN Button -> frische Daten ziehen, Rakete kurz "fliegen", Formular öffnen
  const openFormWithBlast = () => {
    pullLatest();
    setBlast(true);
    setTimeout(() => {
      setFormOpen(true);
      setTimeout(scrollToForm, 30);
      setTimeout(() => setBlast(false), 300);
    }, 260);
  };

  // Google Places Autocomplete im Formular (bearbeitbar)
  useEffect(() => {
    const g = window.google;
    if (!g?.maps?.places || !formGoogleInputRef.current || !formOpen) return;
    try {
      const ac = new g.maps.places.Autocomplete(formGoogleInputRef.current, {
        types: ["establishment"],
        fields: ["name", "formatted_address", "url", "place_id"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const name = place?.name || "";
        const address = place?.formatted_address || "";
        const url = place?.url || "";
        const fresh = [name, address].filter(Boolean).join(", ");
        setGoogleField(fresh);
        setGoogleUrl(url || "");
        try {
          sessionStorage.setItem(
            "sb_selected_profile",
            JSON.stringify({ name, address, url })
          );
        } catch { }
      });
    } catch { }
  }, [formOpen]);

  const onOptionChange = (val) => {
    setOption(val);
    try {
      sessionStorage.setItem("sb_selected_option", val);
    } catch { }
  };

  const fmtCount = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");

  const submit = (e) => {
    e.preventDefault();
    if (!googleField.trim()) {
      alert("Bitte ein Google-Profil angeben.");
      formGoogleInputRef.current?.focus();
      return;
    }
    const customDiscount = Number(sessionStorage.getItem("sb_custom_discount") || 0);

    const payload = {
      googleProfile: googleField.trim(),
      googleUrl,
      selectedOption: option,
      customNotes: option === "custom" ? customNotes.trim() : "",
      company,
      firstName,
      lastName,
      street,
      zip,
      city,
      email,
      phone,
      counts, // für Prefill der /sign Seite
      stats: stats?.breakdown
        ? {
          totalReviews: stats.totalReviews,
          averageRating: stats.averageRating,
          breakdown: stats.breakdown,
        }
        : null,
      submittedAt: new Date().toISOString(),
      customDiscount,
    };
    try {
      sessionStorage.setItem("sb_checkout_payload", JSON.stringify(payload));
    } catch { }
    router.push("/sign");
  };

  return (
    <main className="shell">
      {/* Hero-Bereich über dem Simulator */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-top">
            <h1 className="headline">Hallo 👋</h1>
            <div className="hero-nav">
              <button className="nav-btn primary tour-map" onClick={() => router.push("/dashboard/map")}>
                Karte 🗺️
              </button>
            </div>
          </div>
        </div>
        {activeDiscount > 0 && (
          <div className="discount-banner">
            🏷️ Spezial-Rabatt aktiv: <b>{activeDiscount / 100}€</b> werden abgezogen.
            <button className="clear-disc" onClick={() => {
              sessionStorage.removeItem("sb_custom_discount");
              setActiveDiscount(0);
            }}>Entfernen</button>
          </div>
        )}
      </section>

      {/* 3 Schritte */}
      <section className="steps" aria-label="Ablauf in drei Schritten">
        <ol className="steps-row">
          <li className="step-card">
            <div className="badge">1</div>
            <div className="emoji" aria-hidden>🏢</div>
            <div className="step-title">Unternehmen wählen</div>
          </li>
          <li className="arrow" aria-hidden>→</li>
          <li className="step-card">
            <div className="badge">2</div>
            <div className="emoji" aria-hidden>⭐</div>
            <div className="step-title">Bewertungen auswählen</div>
          </li>
          <li className="arrow" aria-hidden>→</li>
          <li className="step-card">
            <div className="badge">3</div>
            <div className="emoji" aria-hidden>🛋️</div>
            <div className="step-title">Zurücklehnen</div>
          </li>
        </ol>
      </section>

      {/* Live-Simulator – unverändert */}
      <section className="simulator-section tour-stats">
        <LiveSimulator />
      </section>

      {/* CTA unten, elegant eingebunden */}
      {
        !formOpen && (
          <section className="bottom-cta" aria-label="Weiter zum Formular">
            <div className="cta-card">
              <button
                className={`primary-btn tour-new-order ${blast ? "blast" : ""}`}
                onClick={openFormWithBlast}
              >
                <span className="label">Jetzt loslegen</span>
                <span className="rocket" aria-hidden>🚀</span>
              </button>
            </div>
          </section>
        )
      }

      {/* Trust-Leiste */}
      <section className="trust" aria-label="Vertrauen & Sicherheit">
        <ul className="trust-list">
          <li className="trust-item">🔒 DSGVO‑konform</li>
          <li className="trust-item">🛡️ 0% Risiko</li>
          <li className="trust-item">⚖️ 100% legal</li>
        </ul>
      </section>

      {/* Formular-Card */}
      <section
        ref={formRef}
        className={`drawer ${formOpen ? "open" : ""}`}
        aria-hidden={!formOpen}
      >
        <header className="drawer-head">
          <h2 className="title">Es kann gleich losgehen ✨</h2>
          <p className="sub">
            Bitte alle Felder ausfüllen. Mit <span className="req">*</span> markiert = Pflicht.
          </p>
        </header>

        <form className="lead-form" onSubmit={submit}>
          {/* Google-Profil */}
          <div className="group">
            <div className="group-title">
              Google-Profil <span className="req">*</span>
            </div>
            <div className="profile-row">
              <div className="profile-input">
                <input
                  ref={formGoogleInputRef}
                  type="search"
                  inputMode="search"
                  placeholder='Unternehmen suchen oder eintragen… z. B. "Restaurant XY, Berlin"'
                  required
                  value={googleField}
                  onChange={(e) => {
                    setGoogleField(e.target.value);
                    if (googleUrl) setGoogleUrl("");
                  }}
                />
                {googleField && (
                  <button
                    type="button"
                    className="clear-x"
                    aria-label="Feld leeren"
                    onClick={() => {
                      setGoogleField("");
                      setGoogleUrl("");
                      formGoogleInputRef.current?.focus();
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {googleUrl ? (
                <a className="profile-link" href={googleUrl} target="_blank" rel="noreferrer">
                  Profil öffnen ↗
                </a>
              ) : null}
            </div>
          </div>

          {/* Welche Bewertungen sollen gelöscht werden? */}
          <div className="group">
            <div className="group-title">
              Welche Bewertungen sollen gelöscht werden? <span className="req">*</span>
            </div>

            <div className="checks">
              <label className={`choice ${option === "123" ? "on" : ""}`}>
                <input
                  type="radio"
                  name="delopt"
                  value="123"
                  checked={option === "123"}
                  onChange={() => onOptionChange("123")}
                />
                <span className="mark" />
                1–3 ⭐ löschen <span className="hint">→ {fmtCount(counts.c123)} Bewertungen</span>
              </label>

              <label className={`choice ${option === "12" ? "on" : ""}`}>
                <input
                  type="radio"
                  name="delopt"
                  value="12"
                  checked={option === "12"}
                  onChange={() => onOptionChange("12")}
                />
                <span className="mark" />
                1–2 ⭐ löschen <span className="hint">→ {fmtCount(counts.c12)} Bewertungen</span>
              </label>

              <label className={`choice ${option === "1" ? "on" : ""}`}>
                <input
                  type="radio"
                  name="delopt"
                  value="1"
                  checked={option === "1"}
                  onChange={() => onOptionChange("1")}
                />
                <span className="mark" />
                1 ⭐ löschen <span className="hint">→ {fmtCount(counts.c1)} Bewertungen</span>
              </label>

              <label className={`choice ${option === "custom" ? "on" : ""}`}>
                <input
                  type="radio"
                  name="delopt"
                  value="custom"
                  checked={option === "custom"}
                  onChange={() => onOptionChange("custom")}
                />
                <span className="mark" />
                Individuelle Löschungen
              </label>
            </div>

            {option === "custom" && (
              <div className="field">
                <label>Individuelle Wünsche <span className="req">*</span></label>
                <textarea
                  rows={4}
                  placeholder="Beschreibe kurz, was individuell gelöscht werden soll…"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {/* Kontaktdaten */}
          <div className="group section-spacer">
            <div className="group-title">
              <span className="icon">👤</span> Kontaktdaten
            </div>

            <div className="field">
              <label>Firmenname <span className="req">*</span></label>
              <input
                type="text"
                placeholder="z. B. Smashburger GmbH"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
              />
            </div>

            <div className="row">
              <div className="field half">
                <label>Vorname <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="Max"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="field half">
                <label>Nachname <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="Mustermann"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="group section-spacer">
            <div className="group-title">
              <span className="icon">📍</span> Rechnungsadresse
            </div>

            <div className="field">
              <label>Straße & Hausnummer <span className="req">*</span></label>
              <input
                type="text"
                placeholder="Musterstraße 123"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
              />
            </div>

            <div className="row">
              <div className="field half">
                <label>PLZ <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="12345"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  required
                />
              </div>
              <div className="field half">
                <label>Stadt <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="Berlin"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="group section-spacer">
            <div className="group-title">
              <span className="icon">📞</span> Kommunikation
            </div>

            <div className="row">
              <div className="field half">
                <label>E-Mail <span className="req">*</span></label>
                <input
                  type="email"
                  placeholder="max@firma.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field half">
                <label>Telefon <span className="req">*</span></label>
                <input
                  type="tel"
                  placeholder="+49 160 1234567"
                  inputMode="tel"
                  pattern="^[+0-9][0-9 ()-]{6,}$"
                  title="Bitte eine gültige Telefonnummer angeben"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Weiter-Button */}
          <div className="actions center roomy">
            <button className="submit-btn next" type="submit">
              <span className="label">Weiter</span> <span aria-hidden>➡️</span>
            </button>
          </div>
        </form>
      </section>

      {/* Styles */}
      <style jsx global>{`
        :root{
          --ink:#0f172a;
          --muted:#64748b;
          --line:#e5e7eb;
          --shadow:0 22px 60px rgba(2,6,23,.10);
          --shadow-soft:0 16px 36px rgba(2,6,23,.08);
          --blue:#0b6cf2;
        }

        /* ————— 1) HINTERGRUND (sehr dezentes Blau) ————— */
        .shell{
          min-height:100dvh;
          padding:0 14px 80px;
          position: relative;
          z-index: 0;
          background: transparent;
        }
        .shell::before{
          content:"";
          position: fixed;
          inset:0;
          z-index:-1;
          pointer-events:none;
          background:
            radial-gradient(900px 480px at 20% -10%, rgba(11,108,242,0.10) 0%, rgba(11,108,242,0.06) 30%, rgba(11,108,242,0.0) 60%),
            linear-gradient(180deg, #f8fbff 0%, #ffffff 55%, #ffffff 100%);
        }

        /* ————— 2) HERO ————— */
        .hero { margin-top:20px; padding:0; }
        .hero-inner{ max-width:1208px; margin:0 auto; padding: 0 4px; }
        .hero-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
        .headline{ margin:0; font-size: 40px; line-height:1.1; letter-spacing:-.3px }
        .hero-nav { display: flex; gap: 10px; }
        .nav-btn {
            background: #fff; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 12px;
            font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s; font-size: 14px;
        }
        .nav-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); color: #0f172a; }
        .nav-btn.primary { background: #0f172a; color: #fff; border-color: #0f172a; }
        .nav-btn.primary:hover { background: #1e293b; }
        
        .discount-banner { margin-top: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 8px 12px; border-radius: 10px; font-size: 14px; display: flex; align-items: center; gap: 10px; }
        .clear-disc { background: transparent; border: 1px solid #059669; color: #059669; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; font-weight: 700; }
        .clear-disc:hover { background: #059669; color: #fff; }

        /* ————— 3) SCHRITTE ————— */
        .steps{ margin: 20px 0; padding:0; }
        .steps-row{ max-width:1208px; margin:0 auto; padding: 4px; list-style:none; display:flex; align-items:stretch; justify-content:center; gap:10px; }
        .step-card{
          position:relative; overflow:hidden; border-radius:11px; padding:8px 10px;
          background: linear-gradient(180deg, rgba(248,250,253,.78) 0%, rgba(248,250,253,.9) 100%);
          border:1px solid rgba(15,23,42,.05);
          box-shadow:0 4px 12px rgba(2,6,23,.04);
          display:flex; align-items:center; gap:10px; min-height:44px; flex:1;
        }
        .badge{ flex:none; width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-weight:900; color:#0b6cf2; background:#eef4ff; border:1px solid #dbeafe; font-size:11.5px }
        .emoji{ font-size:16px; line-height:1; }
        .step-title{ font-weight:700; font-size:13.8px; letter-spacing:.2px }
        .arrow{ color: rgba(100,116,139,.32); font-size:16px; padding:0 2px; display:flex; align-items:center; justify-content:center; flex:0 0 16px }

        .simulator-section{ margin: 0 auto 0; }

        /* CTA */
        .bottom-cta{ padding: 14px 0 6px; }
        .cta-card{ max-width: 1208px; margin: 0 auto; padding: 14px; display:flex; justify-content:center }
        .primary-btn{ appearance:none;border:1px solid rgba(11,108,242,.28); background:linear-gradient(135deg,#0b6cf2 0%,#3b82f6 100%); color:#fff; padding:14px 22px;border-radius:14px;font-weight:800;letter-spacing:.2px;font-size:16px; box-shadow:0 12px 28px rgba(11,108,242,.28); transition:transform .12s, box-shadow .2s, filter .2s; display:inline-flex;gap:10px;align-items:center;position:relative;overflow:hidden }
        .primary-btn:hover{ transform:translateY(-1px); filter:brightness(1.05); box-shadow:0 18px 36px rgba(11,108,242,.35) }
        .rocket{display:inline-block;transition:transform .25s ease}
        .primary-btn.blast .rocket{transform:translateY(-18px) translateX(6px) rotate(-12deg) scale(1.08)}

        /* Trust-Bar */
        .trust{ padding: 2px 0 0 }
        .trust-list{ list-style:none; display:flex; gap:14px; align-items:center; justify-content:center; margin: 8px auto 0; padding: 0 14px 0; max-width: 980px; flex-wrap: wrap }
        .trust-item{ background:#fff; border:1px solid rgba(15,23,42,.08); box-shadow:0 6px 18px rgba(2,6,23,.05); padding:8px 12px; border-radius:999px; font-weight:800; font-size:13.5px }

        /* Drawer-Card */
        .drawer{
          max-width:920px;
          margin:20px auto 0;
          background: linear-gradient(135deg, rgba(255,255,255,.96) 0%, rgba(255,255,255,.92) 80%);
          backdrop-filter: saturate(1.1) blur(0px);
          border:1px solid rgba(15,23,42,.08);
          border-radius:20px;
          box-shadow: var(--shadow);
          opacity:0; transform: translateY(-6px);
          transition: all .28s ease; pointer-events:none;
        }
        .drawer.open{opacity:1; transform: translateY(0); pointer-events:auto;}

        .drawer-head{text-align:center;padding:22px 22px 0}
        .drawer-head .title{font-family:"Outfit",sans-serif;font-weight:800;font-size:28px;margin:0 0 6px;color:#0f172a}
        .drawer-head .sub{color:#4b5563;font-size:15px;margin:0}

        .lead-form{padding:18px 22px 26px}
        .group{margin-top:18px}
        .section-spacer{margin-top:32px; padding-top:24px; border-top:1px solid #f1f5f9}
        .group-title{font-family:"Outfit",sans-serif;font-weight:700;font-size:18px;color:#0f172a;margin-bottom:12px;display:flex;align-items:center}
        .group-title .icon{margin-right:8px;font-size:20px}
        .req{color:#e11d48;font-weight:800}

        .profile-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .profile-input{position:relative;flex:1 1 520px;min-width:300px}
        .profile-input input{
          width:100%;height:36px;border-radius:10px;border:1px solid rgba(0,0,0,.12);
          padding:8px 34px 8px 12px;font-size:15px;background:#fff;transition:border-color .16s, box-shadow .16s;
        }
        .profile-input input:focus{border-color:#0b6cf2;box-shadow:0 0 0 3px rgba(11,108,242,.2)}
        .clear-x{
          position:absolute;right:8px;top:50%;transform:translateY(-50%);
          width:22px;height:22px;line-height:20px;border-radius:50%;
          border:1px solid rgba(0,0,0,.15);background:#fff;color:#111;font-size:16px;cursor:pointer;padding:0;
        }
        .profile-link{
          display:inline-flex;align-items:center;height:36px;padding:0 12px;border-radius:10px;
          border:1px solid #dbeafe;background:#eef5ff;color:#0a58c7;font-weight:600;text-decoration:none;white-space:nowrap;
        }
        .profile-link:hover{background:#e4efff}

        .checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:8px}
        .choice{
          display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:1px solid #eaf0fe;background:#fff;cursor:pointer;user-select:none;
          font-weight:600;color:#0e0e0e;transition:border-color .14s, box-shadow .14s, transform .05s;
        }
        .choice:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.06);border-color:#d6e5ff}
        .choice.on{box-shadow:0 0 0 2px rgba(11,108,242,.22) inset;border-color:#0b6cf2;background:#eef5ff}
        .choice input{display:none}
        .choice .mark{width:18px;height:18px;border-radius:4px;border:2px solid #64748b;display:inline-block;position:relative;flex:none}
        .choice.on .mark{border-color:#0b6cf2;background:#eaf3ff}
        .choice.on .mark::after{content:"";position:absolute;inset:3px;background:#0b6cf2;border-radius:2px}
        .choice .hint{margin-left:6px;font-weight:700;font-size:13px;color:#0b6cf2}

        .field{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        .field label{font-weight:600;color:#475569;font-size:13px}
        .field input,.field textarea{
          height:34px;border-radius:10px;border:1px solid rgba(0,0,0,.12);padding:6px 10px;font-size:15px;background:#fff;transition:border-color .16s, box-shadow .16s;
        }
        .field textarea{height:auto}
        .field input:focus,.field textarea:focus{border-color:#0b6cf2;box-shadow:0 0 0 3px rgba(11,108,242,.2)}

        .row{display:flex;gap:12px}
        .half{flex:1}

        .actions{display:flex;justify-content:flex-end;margin-top:6px}
        .actions.center{justify-content:center}
        .actions.roomy{margin-top:22px}

        .submit-btn.next{
          display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:999px;border:1px solid #16a34a;
          background:linear-gradient(135deg,#34d399 0%,#22c55e 100%);color:#ffffff;font-weight:800;letter-spacing:.2px;
          box-shadow:0 12px 28px rgba(34,197,94,.35);transition:transform .12s, box-shadow .18s, filter .18s;
        }
        .submit-btn.next:hover{transform:translateY(-1px);filter:brightness(1.03);box-shadow:0 16px 36px rgba(34,197,94,.45)}
        .submit-btn.next:active{transform:translateY(0);filter:brightness(.98);box-shadow:0 8px 18px rgba(34,197,94,.35)}
        .submit-btn.next .label{font-size:16px}

        /* Mobile */
        /* Tablet */
        @media (max-width:1024px){
          .steps-row{ gap:10px }
          .step-card{ flex:1 1 200px; min-height:42px; padding:8px 10px }
          .badge{ width:20px; height:20px; font-size:11px }
          .emoji{ font-size:15px }
          .step-title{ font-size:13.5px }
          .arrow{ font-size:15px; flex-basis:16px }
        }

        /* Mobile */
        @media (max-width:820px){
          .steps-row{ flex-direction:column; align-items:center; gap:8px; max-width:560px }
          .step-card{ width:100%; max-width:360px; flex:0 0 auto; min-height:42px; padding:8px 10px; background: linear-gradient(180deg, rgba(248,250,253,.74) 0%, rgba(248,250,253,.86) 100%) }
          .badge{ width:20px; height:20px }
          .emoji{ font-size:15px }
          .step-title{ font-size:13.2px }
          .arrow{ transform: rotate(90deg); margin: -3px 0; font-size:14px; flex: none; width:16px; height:16px; color: rgba(100,116,139,.3) }
        }

        @media (max-width:820px){
          .drawer{margin:16px 0 0;border-radius:16px}
          .checks{grid-template-columns:1fr}
          .row{flex-direction:column}
          .actions{justify-content:stretch}
          .actions.center{justify-content:center}
          .submit-btn.next{width:100%;justify-content:center}
          .headline{ font-size: 32px; }
          .steps-row{ justify-content: center }
        }
      `}</style>
    </main >
  );
}
