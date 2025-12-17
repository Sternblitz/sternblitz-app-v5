"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle } from "lucide-react"; // Assuming lucide-react is used for icons

export const dynamic = "force-dynamic"; // Rebuild trigger



const RANGE_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "today", label: "Heute" },
  { value: "yesterday", label: "Gestern" },
  { value: "7d", label: "Letzte 7 Tage" },
];

const OPTION_LABELS = {
  "123": "Alle 1–2–3",
  "12": "1–2 Paket",
  "1": "Nur 1 Stern",
  custom: "Individuell",
};

export default function OrdersPage() {
  const router = useRouter();
  const [range, setRange] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  // Statusfilter vorerst entfernt – Fokus auf Übersicht + Suche
  const [dayFilter, setDayFilter] = useState(null); // 'YYYY-MM-DD' oder null
  const [me, setMe] = useState(null); // { role, team_id, full_name, org_id }
  const [repMap, setRepMap] = useState({}); // { userId: { full_name, team_id, role } }
  const [repFilter, setRepFilter] = useState("all");
  const [teamMap, setTeamMap] = useState({}); // { teamId: name }
  const [teamFilter, setTeamFilter] = useState("all");
  const [boardMode, setBoardMode] = useState("reps"); // 'reps' | 'teams'
  const [savingStatusId, setSavingStatusId] = useState(null);
  const [qrForId, setQrForId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState({}); // { [orderId]: true }
  const [confirmEmail, setConfirmEmail] = useState({}); // { [orderId]: email }
  const [confirmSending, setConfirmSending] = useState({}); // { [orderId]: bool }
  const [confirmMsg, setConfirmMsg] = useState({}); // { [orderId]: string|null }
  const [notesDraft, setNotesDraft] = useState({}); // { [orderId]: { sales: string, admin: string } }
  const [promoOnly, setPromoOnly] = useState(false);



  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );
  const intFormatter = useMemo(() => new Intl.NumberFormat("de-DE"), []);
  const decimalFormatter = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    []
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }),
    []
  );

  const formatInt = (value) => (Number.isFinite(Number(value)) ? intFormatter.format(Number(value)) : "—");
  const formatAvg = (value) => (Number.isFinite(Number(value)) ? decimalFormatter.format(Number(value)) : "—");
  const formatPercent = (value) =>
    Number.isFinite(Number(value)) ? `${Math.round(Number(value))} %` : "—";
  const toNumber = (value) => {
    const num = typeof value === "string" ? Number(value) : value;
    return Number.isFinite(num) ? num : null;
  };
  const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : "—");
  const formatEUR = (value) => (Number.isFinite(Number(value)) ? currencyFormatter.format(Number(value)) : "—");
  const STATUS_OPTIONS = [
    { value: "NEW", label: "Neu" },
    { value: "PROCESSING", label: "Löschung in Bearbeitung ⏳" },
    { value: "WAITING_PAYMENT", label: "Erfolgreich gelöscht, warte auf Zahlung 💸" },
    { value: "PAID_DELETED", label: "Bezahlt, warte auf Provision 🤑" },
    { value: "COMMISSION_PAID", label: "Provision ausbezahlt 💰" },
  ];
  const STATUS_LABELS = STATUS_OPTIONS.reduce((acc, it) => { acc[it.value] = it.label; return acc; }, {});
  const normalizeStatus = (raw) => {
    if (!raw) return "NEW";
    // Check for exact matches first (case-insensitive)
    const upper = String(raw).toUpperCase();
    if (STATUS_OPTIONS.some(opt => opt.value === upper)) return upper;

    // Fallback fuzzy matching for legacy/german values
    const s = String(raw).toLowerCase();
    if (s.includes("bearbeit")) return "PROCESSING";
    if (s.includes("erfolg") || s.includes("success")) return "WAITING_PAYMENT";
    if (s.includes("zahl") || s.includes("wait")) return "WAITING_PAYMENT";
    if (s.includes("bezahlt") || s.includes("paid")) return "PAID_DELETED";
    if (s.includes("provision") || s.includes("commission")) return "COMMISSION_PAID";

    return "NEW";
  };

  const localDayKey = (value) => {
    if (!value) return null;
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const labelDay = (key) => {
    if (!key) return "—";
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(dt);
  };

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const search = range === "all" ? "" : `?range=${encodeURIComponent(range)}`;
        const res = await fetch(`/api/orders/list${search}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Fehler beim Laden der Aufträge");
        }
        const data = await res.json();
        if (!ignore) setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch (err) {
        if (ignore || err?.name === "AbortError") return;
        console.error("orders fetch failed", err);
        setError(err?.message || "Unbekannter Fehler");
        setRows([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [range]);

  // Load current profile meta (role, team)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { headers: { Accept: "application/json" } });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok) setMe(json?.profile || null);
      } catch { }
    })();
    return () => { alive = false; };
  }, []);

  // Load teams map for Admin (and TL)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/teams/list", { headers: { Accept: "application/json" } });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok && Array.isArray(json?.rows)) {
          const map = {};
          for (const t of json.rows) map[t.id] = t.name;
          setTeamMap(map);
        }
      } catch { }
    })();
    return () => { alive = false; };
  }, []);

  // Seed rep map from rows (join data / rep_code)
  useEffect(() => {
    if (!Array.isArray(rows)) return;
    setRepMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of rows) {
        const id = row?.created_by;
        if (!id) continue;
        const join = row?.created_by_profile || {};
        const existing = next[id] || {};
        const full_name = join?.full_name || existing.full_name || row?.rep_code || null;
        const team_id = join?.team_id ?? existing.team_id ?? null;
        const role = join?.role || existing.role || null;
        const rep_code = row?.rep_code || existing.rep_code || null;
        if (
          existing.full_name !== full_name ||
          existing.team_id !== team_id ||
          existing.role !== role ||
          existing.rep_code !== rep_code
        ) {
          next[id] = { full_name, team_id, role, rep_code };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  // Load rep names for created_by ids missing from map (fallback)
  useEffect(() => {
    let alive = true;
    const ids = Array.from(new Set((rows || []).map((r) => r?.created_by).filter(Boolean)));
    if (!ids.length) return;
    const missing = ids.filter((id) => !repMap?.[id]?.full_name);
    if (!missing.length) return;
    (async () => {
      try {
        const res = await fetch(`/api/profiles/by-ids?ids=${encodeURIComponent(missing.join(","))}`, { headers: { Accept: "application/json" } });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok && json?.map) {
          setRepMap((prev) => ({ ...prev, ...json.map }));
        }
      } catch { }
    })();
    return () => { alive = false; };
  }, [rows, repMap]);

  const handleRefresh = async (orderId) => {
    if (!orderId) return;
    setRefreshingId(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/refresh`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Aktualisierung fehlgeschlagen");
      }
      if (json?.row) {
        setRows((prev) =>
          Array.isArray(prev)
            ? prev.map((item) =>
              item.id === orderId
                ? {
                  ...item,
                  ...json.row,
                  counts:
                    json.row?.counts && typeof json.row.counts === "object"
                      ? json.row.counts
                      : item.counts ?? null,
                }
                : item
            )
            : prev
        );
      }
    } catch (err) {
      console.error("orders refresh failed", err);
      setError(err?.message || "Aktualisierung fehlgeschlagen");
    } finally {
      setRefreshingId(null);
    }
  };

  const computeMetrics = (row) => {
    const countsObj = row?.counts && typeof row.counts === "object" ? row.counts : null;

    const startBad1 = toNumber(row?.start_bad_1);
    const startBad2 = toNumber(row?.start_bad_2);
    const startBad3 = toNumber(row?.start_bad_3);
    const startValues = [startBad1, startBad2, startBad3].filter((value) => Number.isFinite(value));
    let startSum = startValues.length ? startValues.reduce((sum, value) => sum + value, 0) : null;
    if (!Number.isFinite(startSum) && countsObj) {
      const altStart = toNumber(countsObj.c123);
      if (Number.isFinite(altStart)) startSum = altStart;
    }
    const startTotal = toNumber(row?.start_total_reviews);
    const startAverage = toNumber(row?.start_average_rating);

    const liveBad1 = toNumber(row?.live_bad_1);
    const liveBad2 = toNumber(row?.live_bad_2);
    const liveBad3 = toNumber(row?.live_bad_3);
    const liveValues = [liveBad1, liveBad2, liveBad3].filter((value) => Number.isFinite(value));
    let liveSum = liveValues.length ? liveValues.reduce((sum, value) => sum + value, 0) : null;
    if (!Number.isFinite(liveSum)) {
      if (countsObj) {
        const alt = toNumber(countsObj.c123);
        if (Number.isFinite(alt)) liveSum = alt;
      } else if (Number.isFinite(startSum)) {
        liveSum = startSum;
      }
    }

    const liveTotal = toNumber(row?.live_total_reviews);
    const liveAverageRaw = toNumber(row?.live_average_rating);
    const liveAverage = Number.isFinite(liveAverageRaw)
      ? liveAverageRaw
      : Number.isFinite(startAverage)
        ? startAverage
        : null;
    const liveTotalDisplay = Number.isFinite(liveTotal)
      ? liveTotal
      : Number.isFinite(startTotal)
        ? startTotal
        : null;

    const removed =
      Number.isFinite(startSum) && Number.isFinite(liveSum)
        ? Math.max(0, startSum - liveSum)
        : null;

    let progress = null;
    if (Number.isFinite(startSum) && startSum > 0 && Number.isFinite(liveSum)) {
      progress = Math.max(0, Math.min(100, ((startSum - liveSum) / startSum) * 100));
    } else if (Number.isFinite(startSum) && startSum === 0) {
      progress = Number.isFinite(liveSum) && liveSum <= 0 ? 100 : 0;
    }

    const lastRefresh = row?.last_refreshed_at || row?.created_at;
    const countsLine = countsObj
      ? [
        Number.isFinite(countsObj.c123) ? `${formatInt(countsObj.c123)}× 1–3★` : null,
        Number.isFinite(countsObj.c12) ? `${formatInt(countsObj.c12)}× 1–2★` : null,
        Number.isFinite(countsObj.c1) ? `${formatInt(countsObj.c1)}× 1★` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      : null;

    return {
      startSum,
      startAverage,
      startTotal,
      liveSum,
      liveAverage,
      liveTotalDisplay,
      removed,
      progress,
      lastRefresh,
      countsLine,
    };
  };

  const statusToneClass = (status) => {
    const code = normalizeStatus(status);
    switch (code) {
      case "SUCCESS":
        return "tag-done";
      case "PAID_DELETED":
        return "tag-done";
      case "COMMISSION_PAID":
        return "tag-done";
      case "WAITING_PAYMENT":
        return "tag-wait";
      case "PROCESSING":
        return "tag-progress";
      case "NEW":
        return "tag-active";
      default:
        return "tag-default";
    }
  };

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const isReferralRow = (r) => (r?.referral_channel === 'referral') || Number(r?.discount_cents || 0) > 0 || !!r?.referral_code;

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (dayFilter) {
        const k = localDayKey(r?.created_at);
        if (k !== dayFilter) return false;
      }
      if (teamFilter !== "all" && r?.team_id !== teamFilter) return false;
      if (repFilter !== "all" && r?.created_by !== repFilter) return false;
      if (promoOnly && !isReferralRow(r)) return false;
      if (!term) return true;
      const hay = [
        r?.google_profile,
        r?.review_address,
        r?.company,
        r?.first_name,
        r?.last_name,
        r?.email,
        r?.phone,
        r?.rep_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search, dayFilter, repFilter, teamFilter, promoOnly]);

  const summary = useMemo(() => {
    const base = filteredRows;
    const total = base.length;
    const progresses = base
      .map((r) => computeMetrics(r)?.progress)
      .filter((v) => Number.isFinite(v));
    const avgProgress = progresses.length
      ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
      : null;
    const revenue = total * 299;
    return { total, avgProgress, revenue };
  }, [filteredRows]);

  // Sales KPIs werden separat im Ring berechnet (letzte 7 Tage)



  const renderRow = (row) => {
    const option = OPTION_LABELS[row?.selected_option] || row?.selected_option || "—";
    const metrics = computeMetrics(row);
    const isRefreshing = refreshingId === row.id;
    const expanded = expandedId === row.id;
    const contactName = [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();
    const hasContactDetails = contactName || row?.company || row?.email || row?.phone;
    const phoneHref = row?.phone ? `tel:${String(row.phone).replace(/[^\\d+]/g, "")}` : "";

    const statusKey = (row?.status || "").toLowerCase();
    const showStatus = row?.status && !statusKey.includes("new");
    const repInfo = repMap?.[row?.created_by] || null;
    const repName = repInfo?.full_name || row?.rep_code || (row?.created_by ? String(row.created_by).slice(0, 8) : null);
    const teamName = teamMap?.[row?.team_id] || null;

    const draft = notesDraft[row.id] || {
      sales: (row?.sales_notes ?? row?.custom_notes ?? ""),
      admin: (row?.backoffice_notes ?? ((row?.counts && typeof row.counts === "object" && row.counts._admin_notes) ? String(row.counts._admin_notes) : "")),
    };
    const canEditSales = me?.role === "ADMIN" || me?.role === "TEAM_LEADER" || me?.role === "SALES" || me?.role === "MANAGER";
    const canEditAdmin = me?.role === "ADMIN";
    const setDraft = (patch) => setNotesDraft((prev) => ({ ...prev, [row.id]: { ...draft, ...patch } }));
    const saveNotes = async () => {
      const payload = {};
      if (canEditSales) payload.sales_notes = draft.sales;
      if (canEditAdmin) payload.admin_notes = draft.admin;
      try {
        const res = await fetch(`/api/orders/${row.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Speichern fehlgeschlagen");
        if (json?.row) {
          setRows((prev) => prev.map((it) => it.id === row.id ? { ...it, custom_notes: json.row.custom_notes ?? it.custom_notes, counts: json.row.counts ?? it.counts } : it));
          setNotesDraft((prev) => ({
            ...prev, [row.id]: {
              sales: json?.row?.custom_notes || "",
              admin: (json?.row?.counts && json.row.counts._admin_notes) ? String(json.row.counts._admin_notes) : "",
            }
          }));
        }
      } catch (e) {
        alert(e?.message || "Speichern fehlgeschlagen");
      }
    };
    const handleDelete = async () => {
      if (!(me?.role === "ADMIN")) return;
      const ok = window.confirm("Diesen Auftrag wirklich löschen? Dieser Schritt kann nicht rückgängig gemacht werden.");
      if (!ok) return;
      try {
        const res = await fetch(`/api/orders/${row.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Löschen fehlgeschlagen");
        setRows((prev) => prev.filter((it) => it.id !== row.id));
      } catch (e) {
        alert(e?.message || "Löschen fehlgeschlagen");
      }
    };

    const payStatus = row?.payment_status || null;
    const pmOnFile = Boolean(row?.stripe_payment_method_id);
    const canCharge = me?.role === "ADMIN" && pmOnFile && payStatus !== "paid" && payStatus !== "processing";
    const isReferral = row?.referral_channel === 'referral' || Number(row?.discount_cents || 0) > 0 || !!row?.referral_code;
    const promoCode = row?.referral_code ? String(row.referral_code).toUpperCase() : null;
    const promoValue = Number(row?.discount_cents || 0);
    const chargeAmountCents = Number.isFinite(Number(row?.total_cents)) && Number(row.total_cents) > 0
      ? Number(row.total_cents)
      : Math.max(0, 29900 - promoValue);

    const onCharge = async () => {
      if (!canCharge) return;
      if (!confirm(`Jetzt ${formatEUR(chargeAmountCents / 100)} abbuchen?`)) return;
      try {
        const res = await fetch(`/api/orders/${row.id}/charge`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Fehler beim Abbuchen");
        setRows((prev) => prev.map((it) => it.id === row.id ? { ...it, payment_status: json?.order?.payment_status || it.payment_status, payment_last_event: json?.order?.payment_last_event || it.payment_last_event, charged_amount: json?.order?.charged_amount ?? it.charged_amount } : it));
        alert(`Abbuchung gestartet: ${json?.payment_intent?.status}`);
      } catch (e) {
        alert(e?.message || String(e));
      }
    };

    return (
      <article className={`order-row ${expanded ? "is-open" : ""}`} key={row.id}>
        <div className="summary">
          <div className="summary-main">
            <div className="summary-info">
              {(me?.role === "TEAM_LEADER" || me?.role === "ADMIN" || me?.role === "MANAGER") && (
                <div className="rep-title">{repName || "Unbekannter Vertriebler"}</div>
              )}
              <div className="summary-headline">
                <h3>{row?.google_profile || "Unbenannter Auftrag"}</h3>
                {showStatus ? (
                  <span className={`status-tag ${statusToneClass(row?.status)}`}>
                    {STATUS_LABELS[normalizeStatus(row?.status)] || row.status}
                  </span>
                ) : null}
              </div>
              {teamName ? <p className="team-line">👥 {teamName}</p> : null}
              {row?.review_address ? <p className="summary-address">{row.review_address}</p> : null}
              <p className="summary-meta">
                <span>🗓️ {formatDate(row?.created_at)}</span>
                <span>🔄 {formatDate(metrics.lastRefresh)}</span>
                <span>⭐ {option}</span>
              </p>
              {isReferral ? (
                <div className="ref-line">
                  <span className="pill info">Empfehlung</span>
                  {promoCode ? (
                    <span className="pill promo">🎉 Promo: {promoCode}{promoValue ? ` (−${formatEUR(promoValue / 100)})` : ""}</span>
                  ) : null}
                  {promoValue ? (
                    <span className="pill ok">Promo −{formatEUR(promoValue / 100)}</span>
                  ) : null}
                </div>
              ) : null}
              <div className="pay-line">
                <span className={`pill ${pmOnFile ? 'ok' : 'warn'}`}>{pmOnFile ? 'Zahlungsmittel hinterlegt' : 'Keine Zahlungsdaten'}</span>
                {payStatus ? <span className="pill info">Status: {payStatus}</span> : null}
                {row?.charged_amount ? <span className="pill ok">Bezahlt: {formatEUR(row.charged_amount / 100)}</span> : null}
              </div>
            </div>
            <div className="summary-actions">
              <button
                type="button"
                className="mini-btn"
                onClick={() => toggleExpanded(row.id)}
                aria-expanded={expanded}
              >
                {expanded ? "🔼 Zuklappen" : "🔎 Details"}
              </button>
              {canCharge ? (
                <button type="button" className="mini-btn primary" onClick={onCharge}>{formatEUR(chargeAmountCents / 100)} abbuchen</button>
              ) : null}
              {me?.role === "ADMIN" && (
                <StatusControl
                  value={normalizeStatus(row?.status)}
                  onChange={async (next) => {
                    if (!next || savingStatusId) return;
                    setSavingStatusId(row.id);
                    try {
                      const res = await fetch(`/api/orders/${row.id}/status`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: next }),
                      });
                      const json = await res.json().catch(() => ({}));
                      if (res.ok && json?.row) {
                        setRows((prev) => prev.map((it) => (it.id === row.id ? { ...it, status: json.row.status } : it)));
                      } else {
                        alert(json?.error || "Status konnte nicht gesetzt werden");
                      }
                    } finally {
                      setSavingStatusId(null);
                    }
                  }}
                  disabled={savingStatusId === row.id}
                />
              )}
              <button
                type="button"
                className="mini-btn blue"
                onClick={() => handleRefresh(row.id)}
                disabled={isRefreshing}
              >
                {isRefreshing ? "🔄 Aktualisiere…" : "🔄 Aktualisieren"}
              </button>


            </div>
          </div>
          <div className="summary-stats">
            <div className="stat duo">
              <div className="label">🧹 1–3★</div>
              <div className="value flow">
                <span className="val red">{formatInt(metrics.startSum)}</span>
                <span className="arrow">→</span>
                <span className="val green">{formatInt(metrics.liveSum)}</span>
              </div>
            </div>
            <div className="stat duo">
              <div className="label">⭐ Sterneschnitt</div>
              <div className="value flow">
                <span className="val red">{formatAvg(metrics.startAverage)}</span>
                <span className="arrow">→</span>
                <span className="val green">{formatAvg(metrics.liveAverage)}</span>
              </div>
            </div>
            <div className="stat">
              <div className="label">📊 Gesamt Bewertungen</div>
              <div className="value">{formatInt(metrics.liveTotalDisplay)}</div>
            </div>
          </div>
          {metrics?.progress != null ? (
            <div className="progress">
              <div className="bar">
                <span style={{ width: `${metrics.progress}%` }} />
              </div>
              <div className="progress-meta">
                <span>{formatInt(metrics.startSum)} → {formatInt(metrics.liveSum)}</span>
                <span>{formatPercent(metrics.progress)}</span>
              </div>
            </div>
          ) : null}
          {/* Aufschlüsselung entfernt */}
        </div>
        {expanded ? (
          <div className="details">
            <div className="detail-col">
              <div className="detail-item">
                <div className="detail-label">Preis</div>
                <div className="detail-value">
                  {(() => {
                    const base = 29900;
                    const disc = Number(row?.discount_cents || 0);
                    const total = Number(row?.total_cents || 0);
                    if (disc > 0) {
                      const code = row?.referral_code ? String(row.referral_code).toUpperCase() : null;
                      const finalCents = total > 0 ? total : Math.max(0, base - disc);
                      return (
                        <div>
                          <div><b>Fixpreis:</b> <span className="old">{formatEUR(base / 100)}</span> <span className="arrow">→</span> <span className="new">{formatEUR(finalCents / 100)}</span></div>
                          <div><b>Promo:</b> {code || 'aktiv'} {disc ? ` (−${formatEUR(disc / 100)})` : ''}</div>
                        </div>
                      );
                    }
                    return <div><b>Fixpreis:</b> {formatEUR(base / 100)} (einmalig)</div>;
                  })()}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Kontakt</div>
                {hasContactDetails ? (
                  <div className="detail-value">
                    {contactName ? <div>👤 {contactName}</div> : null}
                    {row?.company ? <div>🏢 {row.company}</div> : null}
                    {row?.email ? (
                      <div>
                        ✉️ <a href={`mailto:${row.email}`}>{row.email}</a>
                      </div>
                    ) : null}
                    {row?.phone ? (
                      <div>
                        ☎️ <a href={phoneHref}>{row.phone}</a>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="detail-value empty">—</div>
                )}
              </div>

              <div className="detail-item">
                <div className="detail-label">Option</div>
                <div className="detail-value">{option}</div>
              </div>

              <div className="detail-item">
                <div className="detail-label">Vertriebs‑Notizen</div>
                <div className="detail-value">
                  <textarea
                    className="notes"
                    value={draft.sales}
                    onChange={(e) => setDraft({ sales: e.target.value })}
                    placeholder="Notiz hinzufügen…"
                    disabled={!canEditSales}
                  />
                  <div className="notes-actions">
                    <button type="button" className="mini-btn blue" onClick={saveNotes} disabled={!canEditSales}>Speichern</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-col">
              <div className="detail-item">
                <div className="detail-label">Links</div>
                <div className="detail-value links">
                  {row?.google_url ? (
                    <a href={row.google_url} target="_blank" rel="noreferrer">Google Profil ↗</a>
                  ) : null}
                  {row?.pdf_signed_url ? (
                    <a href={row.pdf_signed_url} target="_blank" rel="noreferrer">Signiertes PDF ↗</a>
                  ) : null}
                  {row?.pdf_path ? (
                    <span className="hint">Storage: {row.pdf_path}</span>
                  ) : null}

                  {!pmOnFile ? (
                    <>
                      <a className="cta-link" href={`/sign/payment?order=${row.id}`} target="_blank" rel="noreferrer">Zahlungsart hinzufügen ↗</a>
                      <button type="button" className="mini-btn qr" onClick={() => setQrForId(qrForId === row.id ? null : row.id)}>QR anzeigen</button>
                      {qrForId === row.id ? (
                        (() => {
                          const origin = typeof window !== 'undefined' ? window.location.origin : ''; return (
                            <img className="qr" alt="QR zur Zahlungsseite" src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(origin + '/sign/payment?order=' + row.id)}`} />
                          );
                        })()
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="mini-btn send"
                    onClick={() => {
                      setConfirmOpen((m) => ({ ...m, [row.id]: !m[row.id] }));
                      setConfirmMsg((m) => ({ ...m, [row.id]: null }));
                      setConfirmEmail((m) => ({ ...m, [row.id]: row.email || '' }));
                    }}
                  >
                    Auftragsbestätigung senden
                  </button>
                  {confirmOpen[row.id] ? (
                    <div className="send-box">
                      <input
                        type="email"
                        placeholder="E‑Mail des Kunden"
                        value={confirmEmail[row.id] || ''}
                        onChange={(e) => setConfirmEmail((m) => ({ ...m, [row.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="mini-btn blue"
                        disabled={confirmSending[row.id]}
                        onClick={async () => {
                          setConfirmMsg((m) => ({ ...m, [row.id]: null }));
                          setConfirmSending((m) => ({ ...m, [row.id]: true }));
                          try {
                            const to = (confirmEmail[row.id] || '').trim();
                            const res = await fetch(`/api/orders/${row.id}/send-confirmation`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ to }),
                            });
                            const j = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(j?.error || 'Versand fehlgeschlagen');
                            setConfirmMsg((m) => ({ ...m, [row.id]: 'E‑Mail gesendet.' }));
                          } catch (e) {
                            setConfirmMsg((m) => ({ ...m, [row.id]: e?.message || 'Versand fehlgeschlagen' }));
                          } finally {
                            setConfirmSending((m) => ({ ...m, [row.id]: false }));
                          }
                        }}
                      >
                        {confirmSending[row.id] ? (<span className="loader" aria-hidden />) : null}
                        {confirmSending[row.id] ? ' Sende…' : 'Senden'}
                      </button>
                      {confirmMsg[row.id] ? <div className="send-msg">{confirmMsg[row.id]}</div> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-label">Intern</div>
                <div className="detail-value">
                  <div>Rep: {row?.rep_code || "—"}</div>
                  <div>Optionen gewählt: {formatInt(row?.option_chosen_count)}</div>
                  {isReferral ? (
                    <>
                      <div>Promo: Empfehlung</div>
                      <div>Promo-Code: {row?.referral_code ? String(row.referral_code).toUpperCase() : "—"}</div>
                    </>
                  ) : null}
                  {row?.referral_award_status ? <div>Gutschein: {row.referral_award_status === 'awarded' ? 'versendet' : row.referral_award_status === 'pending' ? 'offen' : row.referral_award_status}</div> : null}
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-label">Backoffice‑Notizen</div>
                <div className="detail-value">
                  <textarea
                    className="notes"
                    value={draft.admin}
                    onChange={(e) => setDraft({ admin: e.target.value })}
                    placeholder="Nur von Admin bearbeitbar"
                    disabled={!canEditAdmin}
                  />
                  {canEditAdmin ? (
                    <div className="notes-actions">
                      <button type="button" className="mini-btn blue" onClick={saveNotes}>Speichern</button>
                    </div>
                  ) : null}
                </div>
              </div>

              {me?.role === "ADMIN" && (
                <div className="detail-item danger">
                  <div className="detail-label">Gefahrzone</div>
                  <div className="detail-value">
                    <button type="button" className="danger-btn" onClick={handleDelete}>Auftrag löschen</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
        <style jsx>{`
          .order-row {
            background: #fff;
            border: 1px solid rgba(15,23,42,.08);
            border-radius: 18px;
            padding: 16px;
            box-shadow: 0 6px 26px rgba(0,0,0,.06);
            transition: box-shadow .16s ease, transform .06s ease;
          }
          .order-row:hover { box-shadow: 0 8px 28px rgba(0,0,0,.08); transform: translateY(-1px); }
          .summary { display: flex; flex-direction: column; gap: 12px; }
          .summary-main { display:flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
          .summary-info { min-width:0; }
          .summary-headline { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
          h3 { font-size: 18px; font-weight: 800; margin: 0; }
        .status-tag { display:inline-flex; align-items:center; height: 26px; padding: 0 10px; border-radius: 999px; font-weight: 800; font-size: 12px; letter-spacing: .2px; border:1px solid rgba(0,0,0,.06); }
        .tag-default { background:#f8fafc; color:#0f172a; }
        .tag-active { background:#f1f0ff; color:#4c1d95; border-color: rgba(107,33,168,.22); }
        .tag-paid { background:#eef7ff; color:#0b6cf2; border-color: rgba(11,108,242,.22); }
        .tag-done { background:#ecfdf5; color:#065f46; border-color: rgba(5,150,105,.28); }
        .tag-progress { background:#fff7ed; color:#9a3412; border-color: rgba(251, 146, 60, .35); }
          .tag-wait { background:#fef3c7; color:#92400e; border-color: rgba(245, 158, 11, .35); }
          .summary-address { color:#475569; margin: 2px 0 0; font-size: 14px; }
          .summary-meta { display:flex; flex-wrap:wrap; gap: 8px 14px; margin: 6px 0 0; color:#64748b; font-size: 13px; }
          .pay-line { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px }
          .ref-line { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px }
          .pill { display:inline-flex; align-items:center; height:24px; padding:0 10px; border-radius:999px; font-size:12px; font-weight:800; border:1px solid #e5e7eb; background:#fff; color:#334155 }
          .pill.ok { border-color:#16a34a33; background:#ecfdf5; color:#065f46 }
          .pill.promo { border-color:#16a34a33; background:#f0fdf4; color:#047857 }
          .pill.warn { border-color:#f59e0b33; background:#fffbeb; color:#92400e }
          .pill.info { border-color:#0b6cf233; background:#eef5ff; color:#0b6cf2 }
          .summary-actions { display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
          .team-line { margin: 2px 0 0; font-size: 12px; color:#0b6cf2; font-weight: 800; }
          .action-btn.special {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #fff; border: none;
        }
        .action-btn.invite-btn {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #fff; border: none; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }
        .action-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
          .mini-btn { height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid #e5e7eb; background:#fff; font-weight: 700; font-size: 13px; cursor: pointer; }
          .mini-btn:hover { transform: translateY(-1px); box-shadow:0 2px 10px rgba(0,0,0,.06); }
          .mini-btn.blue { border-color:#0b6cf2; color:#0b6cf2; background:#f0f6ff; }
          .mini-btn.primary { border-color:#0b6cf2; background:#0b6cf2; color:#fff }
          .status-select { height: 34px; padding: 0 8px; font-weight: 700; font-size: 13px; }
          .summary-stats { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
          .stat { background:#f8fafc; border:1px solid #eef2f7; border-radius: 14px; padding: 12px; }
          .stat .label { font-size: 12px; color:#64748b; }
          .stat .value { font-weight: 800; margin-top: 4px; }
          .stat .value.flow { display:flex; align-items:center; gap:8px; }
          .val.red { color:#b91c1c; }
          .val.green { color:#166534; }
          .arrow { color:#94a3b8; font-weight: 700; }
          .progress { display:flex; flex-direction:column; gap:6px; margin-top: 6px; }
          .bar { height: 10px; background:#eef2ff; border-radius:999px; overflow:hidden; }
          .bar span { display:block; height:100%; background: linear-gradient(90deg, #0ea5e9, #22c55e); border-radius:999px; }
          .progress-meta { display:flex; align-items:center; justify-content: space-between; font-size: 12px; color:#64748b; }
          .counts-line { margin: 2px 0 0; color:#334155; font-size: 13px; }
          .details { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; border-top:1px dashed #e5e7eb; margin-top: 14px; padding-top: 14px; }
          .detail-col { display:flex; flex-direction: column; gap: 10px; }
          .detail-item { background:#fbfcff; border: 1px solid #e6ecff; border-radius: 12px; padding: 10px 12px; overflow:hidden; }
          .detail-item.danger { border-color:#fecaca; background:#fff5f5; }
          .detail-label { font-size: 12px; color:#64748b; margin-bottom: 4px; }
          .detail-value { font-weight: 600; color:#0f172a; }
          .detail-value.empty { color:#94a3b8; font-weight: 500; }
          .detail-value.links { display:flex; flex-direction: column; gap: 6px; }
          .detail-value .cta-link { font-weight:800; color:#0b6cf2; text-decoration:none }
          .mini-btn.send { height:32px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; font-weight:800 }
          .send-box{ display:flex; gap:8px; align-items:center; margin-top:8px }
          .send-box input{ flex:1; height:32px; border:1px solid #e5e7eb; border-radius:10px; padding:6px 8px }
          .send-msg{ margin-top:6px; color:#166534; font-weight:800 }
          .loader{ display:inline-block; width:14px; height:14px; border:2px solid #dbeafe; border-top-color:#0b6cf2; border-radius:50%; animation:spin .8s linear infinite; vertical-align:middle; margin-right:6px }
          @keyframes spin{ to { transform: rotate(360deg) } }
          .mini-btn.qr { border-color:#e5e7eb; background:#fff; }
          .qr { width:220px; height:220px; margin-top:6px; border:1px solid #e5e7eb; border-radius:10px; }
          .hint { color:#94a3b8; font-size: 12px; }
          .notes { width: 100%; min-height: 84px; box-sizing: border-box; display:block; border-radius: 10px; border: 1px solid #e5e7eb; padding: 8px 10px; font-size: 14px; line-height: 1.4; resize: vertical; background:#fff; color:#0f172a; font-weight: 400; }
          .notes:focus { outline:none; border-color:#0b6cf2; box-shadow: 0 0 0 3px rgba(11,108,242,.16); }
          .notes-actions { display:flex; justify-content:flex-end; margin-top: 8px; }
          .danger-btn { height: 34px; padding: 0 12px; border-radius:10px; border:1px solid #ef4444; background:#fee2e2; color:#991b1b; font-weight:900; cursor:pointer; }
          .danger-btn:hover { background:#fecaca; transform: translateY(-1px); }
          @media (max-width: 800px) {
            .summary-main { flex-direction: column; align-items: stretch; }
            .summary-actions { justify-content: flex-start; }
            .summary-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .details { grid-template-columns: 1fr; }
          }
          @media (max-width: 640px) {
            .mini-btn { height: 32px; font-size: 12.5px; }
            .summary-stats { grid-template-columns: 1fr; }
            .detail-item { padding: 10px; }
          }
        `}</style>
      </article>
    );
  };

  const renderList = () => {
    if (loading) return <div className="state">Lade Aufträge…</div>;
    if (error) return <div className="state error">{error}</div>;
    if (!filteredRows?.length) return <div className="state empty">Keine Ergebnisse.</div>;
    return filteredRows.map(renderRow);
  };

  const greetingName = (me?.full_name || "").trim();
  const greetingLine = greetingName ? `Hallo ${greetingName} 🚀` : "Hallo 🚀";
  const greetingSub = "Hier sind deine Aufträge – let's go!";

  const isAdmin = me?.role === "ADMIN" || me?.role === "admin";

  return (
    <main className="orders-shell">
      <section className="chart-panel tour-orders-stats">
        <SalesRing rows={rows} />
      </section>
      <header className="orders-head">
        <div className="title">
          <h1>{greetingLine}</h1>
          <p className="sub">{greetingSub}</p>
        </div>
        <div className="actions">
          {(me?.role === "ADMIN" || me?.role === "MANAGER") && (
            <>
              <button type="button" className="action-btn" onClick={() => router.push("/admin/crm/deals")}>
                CRM 👑
              </button>
              {me?.role === "ADMIN" && (
                <button type="button" className="action-btn" onClick={() => router.push("/dashboard/team")}>
                  Invite 👥
                </button>
              )}
              {me?.role === "ADMIN" && (
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    const amount = prompt("Rabatt in € eingeben (z.B. 50):");
                    if (!amount) return;
                    const val = parseFloat(amount.replace(",", "."));
                    if (val > 0) {
                      sessionStorage.setItem("sb_custom_discount", Math.round(val * 100));
                      router.push("/dashboard");
                    }
                  }}
                >
                  Rabatt 🏷️
                </button>
              )}
            </>
          )}
          <button type="button" className="action-btn" onClick={() => router.push("/dashboard")}>
            Neuer Auftrag ➕
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <div className="kpi">
          <div className="kpi-label">📄 Gesamt</div>
          <div className="kpi-value">{formatInt(summary.total)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">💶 Umsatz</div>
          <div className="kpi-value">{formatEUR(summary.revenue)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">📈 Ø Fortschritt</div>
          <div className="kpi-value">{summary.avgProgress != null ? `${summary.avgProgress}%` : "—"}</div>
        </div>
      </section>

      <section className="toolbar">
        <div className="range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`seg ${range === opt.value ? "on" : ""}`}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="filters">
          {(me?.role === "ADMIN") && (
            <button
              type="button"
              className={`chip ${promoOnly ? 'on' : ''}`}
              onClick={() => setPromoOnly((v) => !v)}
              title="Nur Aufträge mit Promo/Rabatt zeigen"
            >
              🎉 Nur Promo
            </button>
          )}

          <div className="date" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>📅 Datum</span>
            <input
              type="date"
              className="chip"
              style={{ padding: '0 10px', height: '32px', border: '1px solid #e5e7eb', borderRadius: '999px', fontFamily: 'inherit', fontWeight: '600', color: '#334155' }}
              value={dayFilter || ""}
              onChange={(e) => setDayFilter(e.target.value || null)}
            />
            {dayFilter ? (
              <button className="chip" onClick={() => setDayFilter(null)}>✖</button>
            ) : null}
          </div>

          <div className="search">
            <input
              type="search"
              placeholder="Suche: Name, Firma, E-Mail, Telefon, Adresse…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>
      <div className="filters">
        {(me?.role === "ADMIN") && (
          <div className="mode">
            <label>Rangliste</label>
            <div className="seg-wrap">
              <button type="button" className={`seg ${boardMode === "reps" ? "on" : ""}`} onClick={() => setBoardMode("reps")}>Vertriebler</button>
              <button type="button" className={`seg ${boardMode === "teams" ? "on" : ""}`} onClick={() => setBoardMode("teams")}>Teams</button>
            </div>
          </div>
        )}

        {(me?.role === "ADMIN") && (
          <div className="teams">
            <label>👥 Teams</label>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="all">Alle</option>
              {Object.entries(teamMap).sort((a, b) => a[1].localeCompare(b[1], 'de')).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
        )}
        {(me?.role === "TEAM_LEADER" || me?.role === "ADMIN") && (
          <div className="reps">
            <label>🧑‍💼 Vertriebler</label>
            <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
              <option value="all">Alle</option>
              {Array.from(new Set((rows || []).map(r => r?.created_by).filter(Boolean)))
                .map((id) => {
                  const name = (repMap?.[id]?.full_name) || (rows.find(rr => rr.created_by === id)?.rep_code) || id;
                  return { id, name };
                })
                .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map(({ id, name }) => (
                  <option key={id} value={id}>{name}</option>
                ))}
            </select>
          </div>
        )}
      </div>

      <section className="list tour-orders-list">
        {(me?.role === "TEAM_LEADER" || me?.role === "ADMIN") ? (
          <Leaderboard
            mode={boardMode}
            rows={filteredRows}
            repMap={repMap}
            teamMap={teamMap}
            onPickRep={(id) => setRepFilter(id || "all")}
            onPickTeam={(id) => setTeamFilter(id || "all")}
          />
        ) : null}
        {renderList()}
      </section>

      <style jsx>{`
        .chart-panel { max-width: 1200px; margin: 0 auto; padding: 0 0 12px; box-sizing: border-box; }
        .orders-shell { max-width: 1200px; margin: 0 auto; padding: 20px 18px 40px; box-sizing: border-box; }
        .orders-head { display:flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .title { display:flex; flex-direction:column; gap:4px; }
        .title h1 { font-size: 30px; margin:0; font-weight:900; letter-spacing:-0.2px; }
        .title .sub { margin: 0; color:#64748b; font-size:14px; font-weight:600; }
        .title h1 { font-size: 30px; margin:0; font-weight:900; letter-spacing:-0.2px; }
        .title .sub { margin: 0; color:#64748b; font-size:14px; font-weight:600; }
        .actions { display:flex; gap: 12px; flex-wrap: wrap; }
        .action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 44px;
          padding: 0 24px;
          border-radius: 999px;
          background: linear-gradient(135deg, #0b6cf2 0%, #3b82f6 100%);
          color: #ffffff;
          font-weight: 800;
          font-size: 15px;
          border: 1px solid rgba(11, 108, 242, 0.25);
          box-shadow: 0 8px 22px rgba(11, 108, 242, 0.28);
          cursor: pointer;
          text-decoration: none;
          transition: all 0.18s ease;
          letter-spacing: 0.2px;
        }
        .action-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 12px 28px rgba(11, 108, 242, 0.35);
          border-color: rgba(11, 108, 242, 0.35);
        }
        .action-btn:active {
          transform: translateY(0);
          filter: brightness(0.96);
        }

        .summary-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 4px 0 12px; }
        .kpi { background:#ffffff; border:1px solid #eef2f7; border-radius: 14px; padding: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.04); }
        .kpi-label { font-size: 12px; color:#64748b; }
        .kpi-value { font-size: 22px; font-weight: 800; margin-top: 4px; }
        .span2 { grid-column: span 2 / span 2; }

        .toolbar { display:flex; justify-content: space-between; align-items:center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .range { display:inline-flex; background:#fff; border-radius:12px; border:1px solid #e5e7eb; padding: 4px; gap:6px; box-shadow:0 2px 8px rgba(0,0,0,.04); }
        .seg { height:34px; padding:0 12px; border-radius:10px; border:1px solid transparent; background:transparent; font-weight:800; color:#334155; cursor:pointer; }
        .seg.on { background:#eef5ff; color:#0b6cf2; border-color:#d0e1ff; }
        .filters { display:flex; align-items:center; gap: 12px; flex-wrap: wrap; }
        .chip { height: 32px; padding: 0 10px; border-radius: 999px; border: 1px solid #e5e7eb; background: #fff; font-weight: 800; color: #334155; cursor: pointer; }
        .chip.on { border-color:#0b6cf2; background:#eef5ff; color:#0b6cf2; }
        .mode { display:flex; align-items:center; gap: 8px; }
        .mode label { font-size: 12px; color:#64748b; font-weight: 700; }
        .seg-wrap { display:inline-flex; background:#fff; border-radius:12px; border:1px solid #e5e7eb; padding: 4px; gap:6px; box-shadow:0 2px 8px rgba(0,0,0,.04); }
        .date { display:flex; align-items:center; gap: 8px; }
        .date label { font-size: 12px; color:#64748b; font-weight: 700; }
        .date input[type="date"] { height: 32px; border-radius: 10px; border: 1px solid #e5e7eb; padding: 0 10px; font-size: 13px; }
        .date input[type="date"]:focus { outline:none; border-color:#0b6cf2; box-shadow: 0 0 0 3px rgba(11,108,242,.16); }
        .teams { display:flex; align-items:center; gap: 8px; }
        .teams label { font-size: 12px; color:#64748b; font-weight: 700; }
        .teams select { height: 32px; border-radius: 10px; border: 1px solid #e5e7eb; padding: 0 10px; font-size: 13px; }
        .reps { display:flex; align-items:center; gap: 8px; }
        .reps label { font-size: 12px; color:#64748b; font-weight: 700; }
        .reps select { height: 32px; border-radius: 10px; border: 1px solid #e5e7eb; padding: 0 10px; font-size: 13px; }
        .rep-title { font-size: 13px; font-weight: 900; color:#0b6cf2; text-transform: uppercase; letter-spacing: .3px; margin-bottom: 6px; }
        .search input { width: 320px; max-width: 62vw; height: 36px; border-radius: 10px; border: 1px solid #e5e7eb; padding: 0 12px; font-size: 14px; }
        .search input:focus { outline: none; border-color:#0b6cf2; box-shadow: 0 0 0 3px rgba(11,108,242,.16); }

        .state { text-align:center; padding: 30px; color:#475569; }
        .state.error { color:#b91c1c; }
        .state.empty { color:#64748b; }
        .list { display:grid; grid-template-columns: 1fr; gap: 14px; }

        @media (max-width: 1024px) {
          .summary-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
          .grid-2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .summary-grid { grid-template-columns: 1fr; }
          .title h1 { font-size: 26px; }
          .title .sub { font-size: 13px; }
        }
        @media (max-width: 800px) {
          .orders-head { flex-direction: column; align-items: flex-start; gap: 8px; }
          .toolbar { flex-direction: column; align-items:flex-start; gap: 10px; }
          .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .span2 { grid-column: auto; }
        }
      `}</style>

    </main >
  );
}

function StatusControl({ value, onChange, disabled }) {
  const opts = [
    { value: "NEW", label: "Neu" },
    { value: "PROCESSING", label: "Löschung in Bearbeitung" },
    { value: "SUCCESS", label: "Löschung Erfolgreich" },
    { value: "WAITING_PAYMENT", label: "Warte auf Zahlung" },
    { value: "PAID_DELETED", label: "Bezahlt -> Prov. fällig" },
    { value: "COMMISSION_PAID", label: "Provision ausbezahlt 💰" },
  ];
  return (
    <>
      <select className="status-select" value={value || "NEW"} onChange={(e) => onChange?.(e.target.value)} disabled={disabled}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <style jsx>{`
        .status-select {
          height: 34px;
          border-radius: 10px;
          border: 1px solid #cbd5e1; /* Visible border */
          background-color: #f8fafc; /* Light background */
          padding: 0 32px 0 12px;
          font-weight: 700;
          font-size: 13px;
          color: #0f172a;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          background-size: 14px;
          transition: all 0.15s ease;
        }
        .status-select:hover {
          border-color: #94a3b8;
          background-color: #f1f5f9;
          box-shadow: 0 2px 8px rgba(0,0,0,.04);
        }
        .status-select:focus {
          outline: none;
          border-color: #0b6cf2;
          box-shadow: 0 0 0 3px rgba(11,108,242,.15);
        }
      `}</style>

    </>
  );
}

function Leaderboard({ mode = "reps", rows, repMap, teamMap, onPickRep, onPickTeam }) {
  const repItems = useMemo(() => {
    const counts = new Map();
    const repCodeMap = new Map();
    for (const r of rows || []) {
      const id = r?.created_by;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!repCodeMap.has(id) && r?.rep_code) repCodeMap.set(id, r.rep_code);
    }
    const arr = Array.from(counts.entries()).map(([id, count]) => ({
      id,
      name: repMap?.[id]?.full_name || repCodeMap.get(id) || id,
      count,
      revenue: count * 299,
    }));
    arr.sort((a, b) => b.revenue - a.revenue || b.count - a.count || a.name.localeCompare(b.name, 'de'));
    return arr;
  }, [rows, repMap]);

  const teamItems = useMemo(() => {
    const counts = new Map();
    for (const r of rows || []) {
      const id = r?.team_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const arr = Array.from(counts.entries()).map(([id, count]) => ({
      id,
      name: teamMap?.[id] || id,
      count,
      revenue: count * 299,
    }));
    arr.sort((a, b) => b.revenue - a.revenue || b.count - a.count || a.name.localeCompare(b.name, 'de'));
    return arr;
  }, [rows, teamMap]);

  const items = mode === "teams" ? teamItems : repItems;
  const head = mode === "teams" ? "🏆 Rangliste Teams (aktuelle Ansicht)" : "🏆 Rangliste Vertriebler (aktuelle Ansicht)";
  const onPick = mode === "teams" ? onPickTeam : onPickRep;
  const allLabel = mode === "teams" ? "Alle Teams" : "Alle Vertriebler";

  if (!items.length) return null;
  return (
    <div className="board">
      <div className="board-head">{head}</div>
      <div className="board-list">
        {items.map((it, idx) => (
          <button key={it.id} className="row" onClick={() => onPick?.(it.id)}>
            <span className="rank">#{idx + 1}</span>
            <span className="name">{it.name}</span>
            <span className="count">{it.count} Aufträge</span>
            <span className="rev">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(it.revenue)}</span>
          </button>
        ))}
        <button className="row all" onClick={() => onPick?.(null)}>{allLabel}</button>
      </div>
      <style jsx>{`
        .board { background:#fff; border:1px solid #eef2f7; border-radius: 16px; padding: 10px; box-shadow: 0 6px 18px rgba(0,0,0,.04); margin-bottom: 10px; }
        .board-head { font-weight: 900; font-size: 13px; color:#0f172a; margin: 4px 8px 8px; }
        .board-list { display:grid; grid-template-columns: 1fr; gap: 6px; }
        .row { display:grid; grid-template-columns: 56px 1fr 140px 140px; align-items:center; gap: 10px; border:1px solid #e5e7eb; background:#fff; border-radius: 10px; padding: 8px 10px; cursor: pointer; text-align:left; }
        .row:hover { transform: translateY(-1px); box-shadow:0 2px 10px rgba(0,0,0,.06); }
        .row.all { justify-content:center; grid-template-columns: 1fr; text-align:center; font-weight: 800; }
        .rank { font-weight: 900; color:#0b6cf2; }
        .name { font-weight: 800; color:#0f172a; }
        .count { color:#334155; font-weight:700; }
        .rev { color:#166534; font-weight:900; text-align:right; }
        @media (max-width: 800px) { .row { grid-template-columns: 40px 1fr; } .count, .rev { display:none; } }
      `}</style>
    </div>
  );
}

function SalesRing({ rows }) {
  const dayKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const counts = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const dt = new Date(r?.created_at);
      if (Number.isNaN(dt.getTime())) continue;
      const k = dayKey(dt);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [rows]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dayKey(today);
  const ordersToday = counts.get(todayKey) || 0;

  // last 7 days (including today)
  let last7Keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7Keys.push(dayKey(d));
  }
  let prev7Keys = [];
  for (let i = 13; i >= 7; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    prev7Keys.push(dayKey(d));
  }
  const total7 = last7Keys.reduce((a, k) => a + (counts.get(k) || 0), 0);
  const totalPrev7 = prev7Keys.reduce((a, k) => a + (counts.get(k) || 0), 0);
  const goal = totalPrev7 > 0 ? totalPrev7 : 10; // dynamisch, min. 10
  const pct = goal > 0 ? Math.min(100, Math.round((total7 / goal) * 100)) : (total7 > 0 ? 100 : 0);

  // SVG Calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const euro = (n) => (Number.isFinite(n) ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n) : "—");

  const weekRevenue = total7 * 299;
  const avgPerDay = total7 / 7;

  return (
    <div className="kpi-wrap">
      <div className="ring-container">
        <svg width="120" height="120" viewBox="0 0 120 120" className="ring-svg">
          {/* Background Track */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="12"
          />
          {/* Progress Arc */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#0b6cf2"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="hole-content">
          <div className="big">{total7}</div>
          <div className="sub">7 Tage</div>
        </div>
      </div>
      <div className="stats">
        <div className="it">
          <div className="lab">📅 Heute</div>
          <div className="val">{ordersToday}</div>
        </div>
        <div className="it">
          <div className="lab">📈 Ø/Tag (7d)</div>
          <div className="val">{avgPerDay ? avgPerDay.toFixed(1) : "—"}</div>
        </div>
        <div className="it">
          <div className="lab">💶 Umsatz (7d)</div>
          <div className="val">{euro(weekRevenue)}</div>
        </div>
      </div>
      <style jsx>{`
        .kpi-wrap { display:flex; align-items:center; gap: 16px; flex-wrap: wrap; background:#fff; border-radius: 16px; padding: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.04); width:100%; box-sizing:border-box; }
        .ring-container { position: relative; width: 120px; height: 120px; flex: none; display: flex; align-items: center; justify-content: center; }
        .ring-svg { transform: rotate(0deg); }
        .hole-content { position:absolute; inset: 0; display:flex; flex-direction: column; align-items:center; justify-content:center; pointer-events: none; }
        .big { font-size: 22px; font-weight: 800; line-height: 1; color: #0f172a; }
        .sub { font-size: 12px; color:#64748b; margin-top: 2px; }
        .stats { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; flex:1; min-width:0; }
        .it { background:#f8fafc; border:1px solid #eef2f7; border-radius: 12px; padding: 10px 12px; }
        .lab { font-size: 12px; color:#64748b; }
        .val { font-weight: 800; margin-top: 4px; display:flex; align-items:center; gap:8px; }
        @media (max-width: 960px) { .kpi-wrap { flex-direction: column; align-items: stretch; gap: 12px; } .ring-container { align-self: center; width: 110px; height: 110px; } .ring-svg { width: 110px; height: 110px; } .stats { width: 100%; grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 560px) { .ring-container { width: 100px; height: 100px; } .ring-svg { width: 100px; height: 100px; } .stats { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
