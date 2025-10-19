"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const RANGE_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "today", label: "Heute" },
  { value: "yesterday", label: "Gestern" },
  { value: "7d", label: "Letzte 7 Tage" },
];

const OPTION_LABELS = {
  "123": "Alle 1-2-3", // matches Simulator keys
  "12": "1-2 Paket",
  "1": "Nur 1 Stern",
  custom: "Individuell",
};

export default function OrdersPage() {
  const [range, setRange] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const renderCounts = (counts) => {
    if (!counts || typeof counts !== "object") return "—";
    const c = counts || {};
    const parts = [];
    if (Number.isFinite(c.c123)) parts.push(`${c.c123}× 1-2-3`);
    if (Number.isFinite(c.c12)) parts.push(`${c.c12}× 1-2`);
    if (Number.isFinite(c.c1)) parts.push(`${c.c1}× 1`);
    return parts.length ? parts.join(" · ") : "—";
  };

  return (
    <main className="orders-shell">
      <header className="orders-head">
        <div>
          <h1>Meine Aufträge</h1>
          <p>Überblick über die zuletzt erstellten Leads aus dem Sternblitz-Simulator.</p>
        </div>
        <Link className="back" href="/dashboard">
          ← Zurück zum Dashboard
        </Link>
      </header>

      <section className="filters">
        <span>Zeitraum:</span>
        <div className="filter-buttons">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={opt.value === range ? "active" : ""}
              onClick={() => setRange(opt.value)}
              disabled={loading && opt.value === range}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="status error">{error}</p>}
      {!error && loading && <p className="status">Lade Aufträge …</p>}
      {!error && !loading && !rows.length && (
        <p className="status">Noch keine Aufträge in diesem Zeitraum gefunden.</p>
      )}

      {!!rows.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Erstellt</th>
                <th>Google-Profil</th>
                <th>Kontakt</th>
                <th>Option</th>
                <th>Statistik</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const option = OPTION_LABELS[row?.selected_option] || row?.selected_option || "—";
                return (
                  <tr key={row.id}>
                    <td>{row?.created_at ? dateFormatter.format(new Date(row.created_at)) : "—"}</td>
                    <td className="profile">
                      <div className="profile-name">{row?.google_profile || "—"}</div>
                      {row?.google_url && (
                        <a href={row.google_url} target="_blank" rel="noopener noreferrer">
                          Google Maps ↗
                        </a>
                      )}
                    </td>
                    <td>
                      <div>{row?.company || "—"}</div>
                      <div className="contact">
                        {[row?.first_name, row?.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="contact">
                        {row?.email && (
                          <a href={`mailto:${row.email}`}>{row.email}</a>
                        )}
                        {row?.phone && (
                          <a href={`tel:${row.phone}`} className="phone">
                            {row.phone}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>{option}</td>
                    <td>{renderCounts(row?.counts)}</td>
                    <td>
                      {row?.pdf_signed_url ? (
                        <a href={row.pdf_signed_url} target="_blank" rel="noopener noreferrer">
                          PDF ansehen
                        </a>
                      ) : row?.pdf_path ? (
                        <span>PDF wird vorbereitet …</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .orders-shell {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 20px 60px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .orders-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }
        .orders-head h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
        }
        .orders-head p {
          margin: 6px 0 0;
          color: #64748b;
        }
        .back {
          color: #2563eb;
          font-weight: 600;
          text-decoration: none;
        }
        .back:hover {
          text-decoration: underline;
        }
        .filters {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .filter-buttons {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .filter-buttons button {
          border: 1px solid #d1d5db;
          background: #f9fafb;
          color: #111;
          border-radius: 999px;
          padding: 6px 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.16s ease;
        }
        .filter-buttons button:hover:not(:disabled) {
          border-color: #2563eb;
          color: #2563eb;
        }
        .filter-buttons button:disabled {
          opacity: 0.65;
          cursor: progress;
        }
        .filter-buttons .active {
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 8px 20px rgba(37, 99, 235, 0.25);
        }
        .status {
          margin: 0;
          color: #475569;
        }
        .status.error {
          color: #dc2626;
        }
        .table-wrap {
          overflow-x: auto;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
          background: #fff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 720px;
        }
        th {
          text-align: left;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
          font-size: 14.5px;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        .profile-name {
          font-weight: 600;
          margin-bottom: 4px;
        }
        .profile a {
          color: #2563eb;
          font-size: 13px;
          text-decoration: none;
        }
        .profile a:hover {
          text-decoration: underline;
        }
        .contact {
          color: #475569;
          font-size: 13px;
        }
        .contact a {
          color: inherit;
          text-decoration: none;
        }
        .contact a:hover {
          text-decoration: underline;
        }
        .contact .phone {
          margin-left: 12px;
        }
        @media (max-width: 768px) {
          .orders-head h1 {
            font-size: 24px;
          }
          table {
            min-width: 600px;
          }
        }
      `}</style>
    </main>
  );
}
