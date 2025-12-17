"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function JoinContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [loading, setLoading] = useState(true);
    const [valid, setValid] = useState(false);
    const [teamName, setTeamName] = useState("");
    const [error, setError] = useState("");

    const [form, setForm] = useState({ fullName: "", email: "", password: "" });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setError("Kein Einladungs-Link gefunden.");
            setLoading(false);
            return;
        }
        // Verify Token
        fetch(`/api/invites/verify?token=${token}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.valid) {
                    setValid(true);
                    setTeamName(data.teamName);
                } else {
                    setError(data.error || "Ungültiger Link");
                }
            })
            .catch(() => setError("Fehler beim Prüfen des Links"))
            .finally(() => setLoading(false));
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, inviteToken: token }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Registrierung fehlgeschlagen");

            // Auto-Login after registration
            const { error: loginError } = await supabase().auth.signInWithPassword({
                email: form.email,
                password: form.password,
            });

            if (loginError) throw loginError;

            router.push("/dashboard");
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    if (loading) return <div className="center">Lade Einladung...</div>;

    if (!valid) {
        return (
            <div className="center">
                <div className="card error">
                    <h1>Ungültiger Link ❌</h1>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="center">
            <div className="card">
                <h1>Willkommen im Team! 🚀</h1>
                <p className="subtitle">Du trittst dem Team <strong>{teamName}</strong> bei.</p>

                <form onSubmit={handleSubmit}>
                    <div className="field">
                        <label>Dein Name</label>
                        <input
                            type="text"
                            required
                            placeholder="Max Mustermann"
                            value={form.fullName}
                            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                        />
                    </div>
                    <div className="field">
                        <label>E-Mail</label>
                        <input
                            type="email"
                            required
                            placeholder="max@sternblitz.de"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                    </div>
                    <div className="field">
                        <label>Passwort</label>
                        <input
                            type="password"
                            required
                            placeholder="••••••••"
                            minLength={6}
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                    </div>

                    {error && <div className="err-msg">{error}</div>}

                    <button type="submit" disabled={submitting} className="btn-main">
                        {submitting ? "Erstelle Account..." : "Jetzt beitreten & starten"}
                    </button>
                </form>
            </div>
            <style jsx>{`
        .center { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f8fafc; padding: 20px; font-family: sans-serif; }
        .card { background: #fff; padding: 40px; border-radius: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.05); width: 100%; max-width: 400px; text-align: center; }
        h1 { margin: 0 0 10px; font-size: 24px; color: #0f172a; }
        .subtitle { color: #64748b; margin-bottom: 30px; }
        .field { margin-bottom: 20px; text-align: left; }
        label { display: block; font-size: 13px; font-weight: 600; color: #64748b; margin-bottom: 6px; }
        input { width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 16px; outline: none; transition: all 0.2s; }
        input:focus { border-color: #0b6cf2; box-shadow: 0 0 0 3px rgba(11,108,242,0.1); }
        .btn-main { width: 100%; padding: 14px; background: #0b6cf2; color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: transform 0.1s; }
        .btn-main:active { transform: scale(0.98); }
        .btn-main:disabled { opacity: 0.7; cursor: not-allowed; }
        .err-msg { color: #dc2626; background: #fef2f2; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
      `}</style>
        </div>
    );
}

export default function JoinPage() {
    return (
        <Suspense fallback={<div>Laden...</div>}>
            <JoinContent />
        </Suspense>
    );
}
