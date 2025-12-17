"use client";
import { useState } from "react";

export default function NewOrderStarter({ prefill }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const startOrder = async () => {
    setBusy(true); setMsg("");
    // Placeholder – später: Insert in Supabase orders
    setTimeout(() => {
      setBusy(false);
      setMsg("Auftrag gestartet (Placeholder) – Formular folgt.");
    }, 500);
  };

  return (
    <div style={{ background:"#fff", padding:16, borderRadius:16, boxShadow:"0 4px 16px rgba(0,0,0,.06)" }}>
      <button onClick={startOrder} disabled={busy}
        className="jetxt-button-review" style={{ width:"100%", minWidth:0 }}>
        {busy ? "..." : "Jetzt loslegen"}
      </button>

      {prefill?.google_profile_url && (
        <p style={{marginTop:8, fontSize:12, color:"#374151"}}>
          Vorbelegt: {prefill.google_profile_url}
        </p>
      )}
      {msg && <p style={{marginTop:8, color:"#065f46"}}>{msg}</p>}
    </div>
  );
}
