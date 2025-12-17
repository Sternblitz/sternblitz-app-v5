"use client";

import { useEffect, useRef, useState } from "react";
import { supabase as supabaseClient } from "@/lib/supabaseClient";
import Script from "next/script";
import { BASE_PRICE_CENTS, computeFinal, formatEUR } from "@/lib/pricing";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { useActivityTracker } from "@/hooks/useActivityTracker";

export default function LiveSimulator() {
  const { trackActivity } = useActivityTracker();
  const inputRef = useRef(null);
  const lastTrackedRef = useRef("");
  const [loadingText, setLoadingText] = useState("");
  const [data, setData] = useState(null); // { averageRating, totalReviews, breakdown }
  const [error, setError] = useState("");
  const [activeOpt, setActiveOpt] = useState("123"); // "123" | "12" | "1"
  const [promo, setPromo] = useState({ code: null, discount: 0 });
  const prefilledOnce = useRef(false);
  const [attentionActive, setAttentionActive] = useState(true);
  const [hasInputValue, setHasInputValue] = useState(false);

  const handleUserInput = () => {
    if (attentionActive) setAttentionActive(false);
  };

  const setInputValue = (value = "") => {
    if (inputRef.current) inputRef.current.value = value;
    setHasInputValue(Boolean((value || "").trim()));
  };

  const clearInput = () => {
    setInputValue("");
    setData(null);
    setError("");
    setLoadingText("");
    try { sessionStorage.removeItem("sb_selected_profile"); } catch { }
  };

  useEffect(() => {
    (async () => {
      try {
        const isFresh = (() => {
          try {
            const flag = sessionStorage.getItem('sb_ref_from_empfehlen');
            const ts = Number(sessionStorage.getItem('sb_ref_from_empfehlen_at'));
            if (!flag || !Number.isFinite(ts)) return false;
            const age = Date.now() - ts;
            return age >= 0 && age <= 30 * 60 * 1000; // 30 Minuten gültig
          } catch { return false; }
        })();
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
        if (!isFresh) {
          // Clear stale promo to avoid sticky discount when not fresh from /empfehlen
          try { sessionStorage.removeItem('sb_ref_code'); sessionStorage.removeItem('sb_ref_discount'); } catch { }
          try { if (typeof document !== 'undefined') document.cookie = 'sb_ref=; Max-Age=0; Path=/'; } catch { }
          setPromo({ code: null, discount: 0 });
          return;
        }
        if (code) {
          if (!discount) discount = 2500;
          setPromo({ code: code.toUpperCase(), discount });
        }
      } catch { }
    })();
  }, []);

  useEffect(() => {
    loadGoogleMaps().then(() => onGoogleLoad());
  }, []);

  // ---------- Google Places ----------
  const onGoogleLoad = () => {
    try {
      const g = window.google;
      if (!g?.maps?.places || !inputRef.current) return;

      const ac = new g.maps.places.Autocomplete(inputRef.current, {
        types: ["establishment"],
        fields: ["name", "formatted_address", "url", "place_id"],
      });

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place?.name) return;
        const name = place.name || "";
        const address = place.formatted_address || "";
        const url = place.url || "";
        const sel = { name, address, url };

        // Profil merken (Formular zieht es beim Klick auf „Jetzt loslegen“)
        try {
          sessionStorage.setItem("sb_selected_profile", JSON.stringify(sel));
        } catch { }
        try {
          window.dispatchEvent(new CustomEvent("sb:profile", { detail: sel }));
        } catch { }

        // Input zeigt den gewählten Eintrag
        setInputValue(`${name}${address ? ", " + address : ""}`);

        // Reviews laden – aber KEIN Formular öffnen!
        runFetch(name, address);
      });
    } catch (e) {
      console.error("Autocomplete init error:", e);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.google?.maps?.places) {
        clearInterval(interval);
        onGoogleLoad();
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // ---------- Fetch & Countdown ----------
  const startCountdown = (secs = 4) => {
    let n = secs;
    setLoadingText(`Lade Bewertungen… ${n}`);
    const id = setInterval(() => {
      n -= 1;
      setLoadingText(n > 0 ? `Lade Bewertungen… ${n}` : "Lade Bewertungen…");
      if (n <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  };

  const runFetch = async (name, address) => {
    setError("");
    setData(null);
    const stop = startCountdown(4);
    try {
      // Dispatch explicit search event for tracking (Legacy for other components)
      try { window.dispatchEvent(new CustomEvent("sb:search", { detail: { name, address } })); } catch { }

      // Direct Tracking (Deduplicated)
      const queryKey = `${name}|${address}`;
      if (lastTrackedRef.current !== queryKey) {
        trackActivity("SIMULATOR_SEARCH", { query: name, address });
        lastTrackedRef.current = queryKey;
      }

      const res = await fetch(
        `/api/reviews?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      stop();
      setLoadingText("");
      if (!json) throw new Error("Leere Antwort von der API");

      // normative Defaults falls Feld fehlt
      const nextData = {
        averageRating: typeof json.averageRating === "number" ? json.averageRating : 4.1,
        totalReviews: typeof json.totalReviews === "number" ? json.totalReviews : 250,
        breakdown: json.breakdown || { 1: 10, 2: 20, 3: 30, 4: 90, 5: 100 },
      };
      setData(nextData);

      // NEU: Stats für Formular persistieren + Event senden
      try {
        sessionStorage.setItem(
          "sb_stats",
          JSON.stringify({
            totalReviews: nextData.totalReviews,
            averageRating: nextData.averageRating,
            breakdown: nextData.breakdown,
          })
        );
      } catch { }
      try {
        window.dispatchEvent(
          new CustomEvent("sb:stats", {
            detail: {
              totalReviews: nextData.totalReviews,
              averageRating: nextData.averageRating,
              breakdown: nextData.breakdown,
            },
          })
        );
      } catch { }

      // Calculation tracking removed as per user request
    } catch (e) {
      stop();
      setLoadingText("");
      setError(`Fehler: ${e.message || String(e)}`);
    }
  };

  // ---------- Prefill from URL or sessionStorage ----------
  useEffect(() => {
    if (prefilledOnce.current) return;
    prefilledOnce.current = true;
    try {
      // 1) From URL params
      const u = new URL(window.location.href);
      const gp = (u.searchParams.get('gp') || '').trim();
      const name = (u.searchParams.get('name') || '').trim();
      const address = (u.searchParams.get('address') || '').trim();
      const url = (u.searchParams.get('url') || '').trim();
      const opt = (u.searchParams.get('opt') || '').trim();

      let finalName = '';
      let finalAddress = '';
      if (gp) {
        const parts = gp.split(',');
        finalName = (parts.shift() || '').trim();
        finalAddress = parts.join(',').trim();
      } else {
        finalName = name;
        finalAddress = address;
      }

      if (finalName) {
        try {
          sessionStorage.setItem('sb_selected_profile', JSON.stringify({ name: finalName, address: finalAddress || '', url }));
        } catch { }
        setInputValue(`${finalName}${finalAddress ? ", " + finalAddress : ''}`);
        runFetch(finalName, finalAddress);
      } else {
        // 2) Fallback: From sessionStorage removed behavior.
        // User wants clean state on return.
      }

      // Option preselect
      const pick = opt || (sessionStorage.getItem('sb_selected_option') || '');
      if (pick && ["123", "12", "1"].includes(pick)) {
        selectOption(pick);
      }
    } catch { }
  }, []);

  // ENTER startet Suche (Fallback ohne Dropdown-Klick)
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = inputRef.current?.value || "";
    if (!raw.trim()) return;
    const parts = raw.split(",");
    const name = (parts.shift() || "").trim();
    const address = parts.join(",").trim();
    const sel = { name, address, url: "" };

    try {
      sessionStorage.setItem("sb_selected_profile", JSON.stringify(sel));
    } catch { }

    runFetch(name, address);
  };

  // ---------- UI Helpers ----------
  const fmt1 = (n) =>
    Number(n).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const computeCurrentVisibility = (rating) => {
    if (rating >= 4.8) return 0;
    if (rating >= 4.2) {
      const norm = (4.8 - rating) / 0.6;
      return -Math.round(170 * Math.sqrt(norm));
    }
    const below = Math.round((4.0 - rating) * 10);
    return -170 - below * 3;
  };

  const computeImprovementVisibility = (oldRating, newRating) => {
    if (newRating <= oldRating) return 0;
    const possible = 5 - oldRating;
    if (possible <= 0) return 0;
    const frac = (newRating - oldRating) / possible;
    return Math.min(200, Math.round(frac * 200));
  };

  // berechne „Nach Löschung“ je nach aktiver Option
  const reducedStats = (dataObj, opt) => {
    const { totalReviews: total, breakdown } = dataObj;
    const map = { "123": [1, 2, 3], "12": [1, 2], "1": [1] };
    const removeArr = map[opt] || [1, 2, 3];

    const kept = { ...breakdown };
    removeArr.forEach((s) => (kept[s] = 0));

    const removed = removeArr.reduce((sum, s) => sum + (breakdown[s] || 0), 0);
    const newTotal = Math.max(0, total - removed) || 1;
    const newSum = [1, 2, 3, 4, 5].reduce((a, s) => a + s * (kept[s] || 0), 0);
    const newAvg = newSum / newTotal;

    return { newTotal, newAvg, removed };
  };

  // counts für Buttons (Formular liest sie später aus sb_stats)
  const getCounts = () => {
    if (!data?.breakdown) return { c123: 0, c12: 0, c1: 0 };
    const b = data.breakdown;
    const c1 = b[1] || 0;
    const c12 = c1 + (b[2] || 0);
    const c123 = c12 + (b[3] || 0);
    return { c123, c12, c1 };
  };

  const { c123, c12, c1 } = getCounts();

  // Option anklicken -> merken (für Formular & spätere Schritte)
  const selectOption = (opt) => {
    setActiveOpt(opt);
    try {
      sessionStorage.setItem("sb_selected_option", opt);
    } catch { }
    try {
      window.dispatchEvent(new CustomEvent("sb:option-changed", { detail: opt }));
    } catch { }
  };

  // Sync option from external sources (e.g., Start form)
  useEffect(() => {
    const onOpt = (e) => {
      const opt = e?.detail;
      if (opt && ["123", "12", "1"].includes(opt)) {
        setActiveOpt(opt);
        try { sessionStorage.setItem("sb_selected_option", opt); } catch { }
      }
    };
    try { window.addEventListener("sb:option-changed", onOpt); } catch { }
    return () => { try { window.removeEventListener("sb:option-changed", onOpt); } catch { } };
  }, []);

  // ---------- Render ----------
  const Cards = () => {
    if (!data) return null;

    const { averageRating: avg, totalReviews: total, breakdown } = data;
    const curVis = computeCurrentVisibility(avg);
    const { newTotal, newAvg } = reducedStats(data, activeOpt);

    return (
      <>
        {/* Sterne-Verteilung */}
        <div className="review-row">
          {[5, 4, 3, 2, 1].map((s) => {
            const count = Number(breakdown[s] || 0).toLocaleString();
            const cls = s >= 4 ? "rating-chip positive-chip" : "rating-chip negative-chip";
            return (
              <div key={s} className={cls}>
                {s} ⭐ <span>{count}</span>
              </div>
            );
          })}
        </div>

        {/* Klammer + 1–3 Summe */}
        <div className="rating-block">
          <img
            src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/689f5500b57e679a1940c168_bracket-img.webp"
            alt="curve line"
            className="line-top"
          />
          <div className="rating-text">
            <span className="icon">⚠️</span>
            <span className="text">
              1–3 Sterne:{" "}
              <strong id="bad-count">
                {((breakdown[1] || 0) + (breakdown[2] || 0) + (breakdown[3] || 0)).toLocaleString()}
              </strong>
            </span>
            <span className="close">❌</span>
          </div>
        </div>

        {/* Karten */}
        <div className="review-row stack" style={{ alignItems: "flex-center" }}>
          <div className="rating-card">
            <div className="card-header header-current"><span>AKTUELL</span></div>
            <div className="card-body">
              <img className="star-icon" style={{ width: "100%", maxWidth: 48 }}
                src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/689f5709ae0db7541734c589_red-cross.webp" alt="Sterne" />
              <div className="before-after-text">
                <h2 className="rating-value" style={{ margin: 0 }}>{fmt1(avg)} ⭐</h2>
                <p className="review-count" style={{ margin: 0 }}>{total.toLocaleString()} Bewertungen</p>
              </div>
            </div>
            <p className="visibility-pill"><span style={{ fontWeight: 700 }}>{curVis}%</span> Online-Sichtbarkeit</p>
          </div>

          <div className="arrow-icon" style={{ fontSize: 28, fontWeight: 700, margin: "0 6px" }}>
            <img src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/689ec12c6a1613f9c349ca46_yellow-arrow.avif" alt="→" />
          </div>

          <div className="rating-card">
            <div className="card-header header-after"><span>NACH LÖSCHUNG</span></div>
            <div className="card-body">
              <img className="star-icon" style={{ width: "100%", maxWidth: 48 }}
                src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/689f5706192ab7698165e044_green-light.webp" alt="Sterne" />
              <div className="before-after-text">
                <h2 className="rating-value shake" style={{ margin: 0 }}>⚡ ⭐ {fmt1(newAvg)}</h2>
                <p className="review-count" style={{ margin: 0 }}>{newTotal.toLocaleString()} Bewertungen</p>
              </div>
            </div>
            <p className="visibility-pill visibility-green" id="vis-new">
              <span style={{ fontWeight: 700 }}>
                +{computeImprovementVisibility(avg, newAvg)}%
              </span>{" "}
              Online-Sichtbarkeit
            </p>
          </div>
        </div>

        {/* Optionen */}
        <p className="option-hint">Wie viele Sterne sollen weg? 👇</p>
        <div className="option-row">
          <button
            className={`delete-option ${activeOpt === "123" ? "active" : ""}`}
            onClick={() => selectOption("123")}
            aria-pressed={activeOpt === "123"}
          >
            <span className="option-title">1–3 ⭐ löschen</span>
            <div className="option-sub">
              <div>Entfernte: {c123.toLocaleString()}</div>
              <div>
                {promo.discount ? (
                  <>
                    <span className="old">{formatEUR(BASE_PRICE_CENTS)}</span> <span className="arrow">→</span> <span className="new">{formatEUR(computeFinal(BASE_PRICE_CENTS, promo.discount))}</span>
                  </>
                ) : (
                  <span>Pauschal {formatEUR(BASE_PRICE_CENTS)}</span>
                )}
              </div>
            </div>
          </button>

          <button
            className={`delete-option ${activeOpt === "12" ? "active" : ""}`}
            onClick={() => selectOption("12")}
            aria-pressed={activeOpt === "12"}
          >
            <span className="option-title">1–2 ⭐ löschen</span>
            <div className="option-sub">
              <div>Entfernte: {c12.toLocaleString()}</div>
              <div>
                {promo.discount ? (
                  <>
                    <span className="old">{formatEUR(BASE_PRICE_CENTS)}</span> <span className="arrow">→</span> <span className="new">{formatEUR(computeFinal(BASE_PRICE_CENTS, promo.discount))}</span>
                  </>
                ) : (
                  <span>Pauschal {formatEUR(BASE_PRICE_CENTS)}</span>
                )}
              </div>
            </div>
          </button>

          <button
            className={`delete-option ${activeOpt === "1" ? "active" : ""}`}
            onClick={() => selectOption("1")}
            aria-pressed={activeOpt === "1"}
          >
            <span className="option-title">1 ⭐ löschen</span>
            <div className="option-sub">
              <div>Entfernte: {c1.toLocaleString()}</div>
              <div>
                {promo.discount ? (
                  <>
                    <span className="old">{formatEUR(BASE_PRICE_CENTS)}</span> <span className="arrow">→</span> <span className="new">{formatEUR(computeFinal(BASE_PRICE_CENTS, promo.discount))}</span>
                  </>
                ) : (
                  <span>Pauschal {formatEUR(BASE_PRICE_CENTS)}</span>
                )}
              </div>
            </div>
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Google Places laden */}
      {/* Google Places laden via centralized loader */}

      <div className="review-container">
        <h3 className="section-title">
          <img
            className="search-icon"
            src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68a00396345c18200df4a5b3_%F0%9F%94%8D.webp"
            alt="search-icon"
          />
          Live-Simulator: So viele Sterne hättest du ohne Hater.
        </h3>

        <div className="review-card">
          {/* Eingabefeld stets zentriert */}
          <div className="input-wrapper">
            <div className="input-shell">
              <input
                ref={inputRef}
                id="company-input"
                type="search"
                inputMode="search"
                placeholder='Dein Unternehmen suchen... – z.B. "Restaurant XY"'
                className={`search-box ${attentionActive ? 'attention' : ''}`}
                autoComplete="off"
                onKeyDown={onKeyDown}
                onFocus={handleUserInput}
                onInput={(e) => {
                  handleUserInput();
                  setHasInputValue(Boolean((e.target.value || '').trim()));
                }}
              />
              <button
                type="button"
                className={`clear-input ${hasInputValue ? 'show' : ''}`}
                onClick={clearInput}
                aria-label="Eingabe löschen"
              >
                ×
              </button>
            </div>
          </div>

          {loadingText && <div id="review-output" className="loading-text">{loadingText}</div>}
          {error && !loadingText && (
            <div className="loading-text" style={{ color: "#E1432E" }}>{error}</div>
          )}
          {!loadingText && data && (
            <div id="simulator" className="simulator-wrapper">
              <Cards />
            </div>
          )}
        </div>
      </div>

      {/* ======= Styles: Webflow-Optik + Fonts + Responsiveness ======= */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Poppins:wght@300;400;500;600;700&display=swap');

        .review-container{font-family:'Poppins',sans-serif;max-width:1207px;margin:auto;padding:80px 10px;border-radius:16px;background:url("https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/689acdb9f72cb41186204eda_stars-rating.webp") center/cover no-repeat}
        .section-title{max-width:975px;font-family:'Outfit',sans-serif;color:#010101;font-weight:400!important;margin:0 auto;font-size:48px;line-height:120%;text-align:center}
        .search-icon{display:inline-block;vertical-align:middle;margin-right:12px;width:48px;height:auto;margin-top:-8px}
        .review-card{max-width:755px;margin:40px auto 0;padding:40px;border-radius:8px;background:#fff}

        /* Eingabefeld zentrieren + Breite kontrollieren */
        .input-wrapper{display:flex;justify-content:center}
        .input-shell{position:relative;width:100%;max-width:675px}
        .search-box{display:block;width:100%;margin:0 auto;padding:9px 44px 9px 20px;border:1px solid rgba(1,1,1,.1);border-radius:8px;font-family:Poppins;font-size:18px;line-height:150%;outline:none;box-sizing:border-box}
        .clear-input{position:absolute;top:50%;right:12px;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:1px solid rgba(1,1,1,.12);background:#fff;font-size:18px;font-weight:600;color:#5f6368;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s ease, background .15s ease, transform .15s ease}
        .clear-input.show{opacity:.85;pointer-events:auto}
        .clear-input:hover{background:#f7f7f8;transform:translateY(-50%) scale(1.05)}
        .search-box:focus{border-color:#49a84c}
        .search-box.attention{animation:breathe 2.2s ease-in-out infinite}
        @keyframes breathe{0%{transform:scale(.985);box-shadow:0 0 0 rgba(73,168,76,0)}50%{transform:scale(1);box-shadow:0 10px 28px rgba(73,168,76,.18)}100%{transform:scale(.985);box-shadow:0 0 0 rgba(73,168,76,0)}}

        .loading-text{color:#010101;margin-top:8px;font-size:18px;font-weight:600;text-align:center}

        .review-row{display:flex;align-items:center;width:100%;max-width:675px;margin:24px auto 0;justify-content:space-between;gap:31px}
        .rating-chip{height:100%;text-align:center;padding:8px 12px;border-radius:6px;font-size:15px;font-weight:600;white-space:nowrap}
        .positive-chip{background-color:#49A84C1F;color:#49A84C}
        .negative-chip{background-color:#E1432E1F;color:#FF473F}

        .rating-card{overflow:hidden;width:100%;height:174px;max-width:274px;border:1px solid rgba(225,67,46,.12);border-radius:8px}
        .card-header{display:flex;justify-content:center;align-items:center;height:42px;font-size:20px;font-family:'Outfit',sans-serif;font-weight:600;color:#fff}
        .header-current{background-color:#E0422F}
        .header-after{background-color:#49A84C}
        .card-body{display:flex;align-items:center;width:100%;padding:14px;gap:15px}
        .review-count{font-family:Poppins;color:rgba(1,1,1,.7);font-size:14px;font-weight:300;line-height:120%}
        .rating-value{margin:0;opacity:.9;font-family:'Outfit',sans-serif;color:#010101;font-size:27px!important;font-weight:700;line-height:100%}

        /* Sichtbarkeits-Pills */
        .visibility-pill{
          display:block;text-align:center;margin:8px auto 12px;padding:8px 16px;border-radius:69px;background:rgba(255,71,63,.12);
          font-family:'Outfit',sans-serif;color:#FF473F;font-size:14px;line-height:1;width:auto;max-width:238px;white-space:nowrap;box-sizing:border-box;
        }
        .visibility-green{background:#E8F5E9!important;color:#49A84C!important}

        .rating-block{text-align:center;display:flex;flex-direction:column;width:100%;max-width:341px;margin-left:auto;justify-content:end;position:relative;margin-bottom:20px;z-index:2}
        .line-top{width:100%;display:block;margin:0 auto 6px}
        .rating-text{font-family:'Outfit',sans-serif;color:#e13121;display:flex;align-items:baseline;justify-content:center;gap:6px;font-size:19px;font-weight:600;line-height:1}
        .rating-text .text,#bad-count{font-size:21px;font-weight:800;color:#e13121;line-height:1}
        .rating-text .icon,.rating-text .close{font-size:16px;color:#FF473F;line-height:1}

        .option-hint{text-align:center;font-family:Poppins,sans-serif;font-size:15px;font-weight:500;margin:30px 0 -3px 0;color:#010101}
        .option-row{display:flex;margin-top:24px;gap:20px;justify-content:center;flex-wrap:wrap}
        .delete-option{flex:1 1 0;max-width:232px;padding:16px 16px;text-align:start;border:1px solid #eaf0fe;background:transparent;border-radius:10px;cursor:pointer;transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease}
        .delete-option:hover{transform:translateY(-1px);box-shadow:0 2px 10px rgba(0,0,0,.06);border-color:#d6e5ff}
        .delete-option.active{box-shadow:0 0 0 2px rgba(73,168,76,.25) inset;border-color:#49A84C}
        .option-title{margin:0 0 6px 0;font-family:Poppins;color:#0e0e0e;font-size:22px;font-weight:700;line-height:120%}
        .option-sub{margin-top:2px;font-family:Poppins;color:#1a1a1a;line-height:1.35}
        .option-sub div:first-child{font-size:15px;font-weight:800;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px;text-decoration-color:rgba(73,168,76,.55)}
        .option-sub div:last-child{font-size:12.5px;font-weight:600;color:rgba(0,0,0,.62);letter-spacing:.1px}
        .option-sub .old{text-decoration:line-through;color:#64748b}
        .option-sub .arrow{color:#0b6cf2;font-weight:900;margin:0 4px}
        .option-sub .new{color:#0f172a;font-weight:900}

        /* ---------- Responsive ---------- */
        @media (max-width:991px){
          .review-container{padding:70px 10px}
          .section-title{max-width:550px;font-size:40px}
          .visibility-pill{font-size:13px;padding:7px 14px;max-width:220px}
        }
        @media (max-width:767px){
          .review-container{padding:50px 10px}
          .section-title{font-size:36px}
          .review-card{margin-top:24px;padding:24px 12px}
          .review-row{gap:12px}
          .review-row.stack{flex-direction:column}
          .search-box{font-size:16px;max-width:100%}
          .option-title{font-size:20px}
        }
        @media (max-width:479px){
          .review-container{padding:40px 10px;border-radius:12px}
          .section-title{font-size:32px}
          .review-card{padding:20px 12px 12px}
          .search-box{height:46px;padding:0 12px;font-size:16px;max-width:100%}
          .rating-chip{font-size:10px;padding:3px 7px}
          .rating-card{max-width:273px}
          .card-header{height:35px}
          .rating-value{font-size:22px!important}
          .visibility-pill{font-size:12px;padding:6px 12px;max-width:200px}
          .delete-option{max-width:175px;padding:12px}
          .option-title{font-size:16px}
        }

        /* --- Bracket/Arrow rechtsbündig unter 1–3 Sterne wie im Webflow-Design --- */
        .rating-block{
          position:relative;display:flex;flex-direction:column;align-items:flex-end;width:100%;max-width:675px;margin:12px auto 20px auto;padding-right:24px;z-index:2
        }
        .line-top{display:block;width:38%;max-width:260px;margin-right:12px;margin-bottom:6px;height:auto;object-fit:contain}
        .rating-text{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;font-family:'Outfit',sans-serif;color:#e13121;font-size:19px;font-weight:600;line-height:1;margin-right:12px}
        .rating-text .text,#bad-count{font-size:21px;font-weight:800;color:#e13121;line-height:1}
        .rating-text .icon,.rating-text .close{font-size:16px;color:#FF473F;line-height:1}
        #bad-count{position:relative;display:inline-block;padding-bottom:12px}

        @media (max-width:991px){.line-top{width:42%;max-width:230px}}
        @media (max-width:767px){
          .rating-block{padding-right:10px;margin-bottom:16px}
          .line-top{width:46%;max-width:200px;margin-right:8px}
          .rating-text{font-size:18px;margin-right:8px}
          #bad-count::after{width:150%;height:16px}
        }
        @media (max-width:479px){
          .rating-block{padding-right:4px;margin-bottom:14px}
          .line-top{width:50%;max-width:180px}
          .rating-text{font-size:16px}
          #bad-count::after{width:140%;height:15px}
        }
/* 1) Elternkarte bereit für Layering */
.review-card{
  position: relative;           /* neuer Stacking-Context für das Pseudo-Element */
  border-radius: 16px;          /* wie gehabt */
  /* Nichts weiter ändern – Inhalte bleiben unverändert */
}

/* 2) Weiße Box hinter ALLEM in der Karte */
.review-card::before{
  content: "";
  position: absolute;
  inset: 0;                     /* füllt die ganze Karte */
  border-radius: inherit;
  background: #fff;             /* <<< die weiße Fläche */
  border: 1px solid rgba(15,23,42,.06);
  box-shadow: 0 25px 60px rgba(2,6,23,.10);
  z-index: 0;                   /* liegt hinter den echten Inhalten der Karte */
}

/* 3) Inhalte der Karte sicher über die weiße Box legen */
.review-card > *{
  position: relative;
  z-index: 1;
}
      `}</style>
    </>
  );
}
