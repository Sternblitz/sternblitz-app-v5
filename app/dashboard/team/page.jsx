"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TeamPage() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviteLink, setInviteLink] = useState("");
    const [generating, setGenerating] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState("");

    useEffect(() => {
        loadTeams();
    }, []);

    const loadTeams = async () => {
        try {
            const { data: { user } } = await supabase().auth.getUser();
            if (!user) return;

            // Check if Admin
            const { data: profile } = await supabase()
                .from("profiles")
                .select("role")
                .eq("user_id", user.id)
                .single();

            if (profile?.role !== "ADMIN") {
                setLoading(false);
                return; // Only admins see this
            }

            const { data } = await supabase().from("teams").select("*");
            setTeams(data || []);
            if (data && data.length > 0) setSelectedTeam(data[0].id);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const createInvite = async () => {
        if (!selectedTeam) return;
        setGenerating(true);
        setInviteLink("");
        try {
            const res = await fetch("/api/invites/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ team_id: selectedTeam }),
            });
            const json = await res.json();
            if (json.inviteUrl) {
                setInviteLink(json.inviteUrl);
            } else {
                alert(json.error || "Fehler beim Erstellen");
            }
        } catch (e) {
            alert("Fehler: " + e.message);
        } finally {
            setGenerating(false);
        }
    };

    const copyLink = () => {
        navigator.clipboard.writeText(inviteLink);
        alert("Link kopiert! 📋");
    };

    if (loading) return <div className="p-8">Lade Teams...</div>;

    return (
        <div className="shell">
            <div className="container">
                <h1>Team Verwaltung 👥</h1>
                <p className="sub">Erstelle Einladungs-Links für neue Vertriebler.</p>

                <div className="card">
                    <h2>Neuen Vertriebler einladen</h2>
                    <div className="form-row">
                        <div className="field">
                            <label>Team wählen</label>
                            <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                                {teams.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <button className="btn-gen" onClick={createInvite} disabled={generating}>
                            {generating ? "Erstelle..." : "Link generieren 🔗"}
                        </button>
                    </div>

                    {inviteLink && (
                        <div className="result-box">
                            <input type="text" readOnly value={inviteLink} />
                            <button onClick={copyLink}>Kopieren</button>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
        .shell { padding: 40px; background: #f8fafc; min-height: 100vh; }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { font-size: 28px; color: #0f172a; margin: 0 0 8px; }
        .sub { color: #64748b; margin-bottom: 30px; }
        .card { background: #fff; padding: 24px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h2 { font-size: 18px; margin: 0 0 20px; color: #0f172a; }
        .form-row { display: flex; gap: 12px; align-items: flex-end; margin-bottom: 20px; }
        .field { flex: 1; }
        label { display: block; font-size: 13px; font-weight: 600; color: #64748b; margin-bottom: 6px; }
        select { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 15px; }
        .btn-gen { padding: 10px 20px; background: #0f172a; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; height: 42px; }
        .result-box { display: flex; gap: 8px; background: #f1f5f9; padding: 12px; border-radius: 10px; align-items: center; }
        .result-box input { flex: 1; background: transparent; border: none; font-family: monospace; font-size: 14px; color: #334155; outline: none; }
        .result-box button { background: #fff; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; color: #0f172a; }
      `}</style>
        </div>
    );
}
