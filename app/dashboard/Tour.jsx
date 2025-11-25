"use client";

import { useState, useEffect } from "react";
import Joyride, { STATUS, EVENTS, ACTIONS } from "react-joyride";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";

export default function Tour() {
    const router = useRouter();
    const pathname = usePathname();
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [demoName, setDemoName] = useState("Piazza Rossa"); // Default fallback

    // Check if tour should run
    useEffect(() => {
        const checkTourStatus = async () => {
            const { data: { user } } = await supabase().auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase()
                .from("profiles")
                .select("tour_seen")
                .eq("user_id", user.id)
                .single();

            if (profile && !profile.tour_seen) {
                setRun(true);
            }
        };
        checkTourStatus();
    }, []);

    const steps = [
        // --- PHASE 1: INTRO & MAP ---
        {
            content: (
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, background: "linear-gradient(135deg, #0b6cf2 0%, #0044cc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Dein Weg zum Top-Verkäufer 🚀</h2>
                    <p style={{ fontSize: 15, color: "#475569" }}>In dieser interaktiven Tour zeigen wir dir, wie du mit Sternblitz in <b>unter 2 Minuten</b> einen Deal abschließt.</p>
                    <div style={{ marginTop: 20, fontWeight: 700, color: "#0b6cf2", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px" }}>Phase 1: Leads finden 🗺️</div>
                </div>
            ),
            placement: "center",
            target: "body",
            disableBeacon: true,
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Die Karte 🗺️</h3>
                    <p>Hier beginnt deine Jagd. Wir wechseln jetzt zur Kartenansicht, um potenzielle Kunden in deiner Nähe zu finden.</p>
                </div>
            ),
            target: ".tour-map",
            placement: "bottom",
            spotlightClicks: true,
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Smart Scan 🔍</h3>
                    <p>Unser Algorithmus analysiert die Umgebung und filtert automatisch die besten Leads für dich heraus.</p>
                    <div style={{ background: "#f0f9ff", padding: "10px 14px", borderRadius: 8, marginTop: 12, borderLeft: "4px solid #0b6cf2" }}>
                        <strong style={{ color: "#0b6cf2", fontSize: 12 }}>PRO TIPP:</strong>
                        <p style={{ fontSize: 12, margin: "4px 0 0 0", color: "#334155" }}>Nutze diese Funktion immer direkt vor Ort beim Kunden.</p>
                    </div>
                </div>
            ),
            target: ".tour-map-scan",
            placement: "top",
            spotlightClicks: true,
        },
        // LOADING STATE
        {
            content: (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{ fontSize: 32, marginBottom: 16, animation: "spin 2s linear infinite" }}>⏳</div>
                    <h3 style={{ fontWeight: 700, fontSize: 20 }}>Lade potentielle Kunden...</h3>
                    <p style={{ color: "#64748b" }}>Wir suchen nach Unternehmen mit Optimierungsbedarf.</p>
                </div>
            ),
            target: "body",
            placement: "center",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Gefundene Leads 📝</h3>
                    <p>Hier sind die Ergebnisse. Wir wählen zur Demonstration einen Eintrag aus deiner Umgebung.</p>
                    <div style={{ background: "#fff1f2", padding: "10px 14px", borderRadius: 8, marginTop: 12, borderLeft: "4px solid #e11d48" }}>
                        <strong style={{ color: "#e11d48", fontSize: 12 }}>VERKAUFS-PSYCHOLOGIE:</strong>
                        <p style={{ fontSize: 12, margin: "4px 0 0 0", color: "#334155" }}>Achte auf rote Sterne. Schlechte Bewertungen sind der stärkste Schmerzpunkt für Unternehmer.</p>
                    </div>
                </div>
            ),
            target: ".tour-map-list",
            placement: "right",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Details ansehen 🧐</h3>
                    <p>Hier siehst du alle Infos auf einen Blick. Jetzt starten wir den <b>Live-Simulator</b>, um den Kunden zu überzeugen.</p>
                </div>
            ),
            target: ".drawer", // Will be visible after click
            placement: "top",
        },

        // --- PHASE 2: DASHBOARD & SIMULATOR ---
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Zurück zum Dashboard 🏠</h3>
                    <p>Wir simulieren jetzt das Verkaufsgespräch für <b>{demoName}</b>.</p>
                </div>
            ),
            target: "body",
            placement: "center",
        },
        // SIMULATOR LOADING
        {
            content: (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{ fontSize: 32, marginBottom: 16 }}>🔄</div>
                    <h3 style={{ fontWeight: 700, fontSize: 20 }}>Analysiere Bewertungen...</h3>
                    <p style={{ color: "#64748b" }}>Wir berechnen das Lösch-Potenzial für {demoName}.</p>
                </div>
            ),
            target: ".tour-stats",
            placement: "bottom",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Der "Aha-Moment" 💡</h3>
                    <p>Das ist dein mächtigstes Werkzeug. Du zeigst dem Kunden schwarz auf weiß, wie viele schlechte Bewertungen er löschen kann.</p>
                    <div style={{ background: "#f0f9ff", padding: "10px 14px", borderRadius: 8, marginTop: 12, borderLeft: "4px solid #0b6cf2" }}>
                        <strong style={{ color: "#0b6cf2", fontSize: 12 }}>STRATEGIE:</strong>
                        <p style={{ fontSize: 12, margin: "4px 0 0 0", color: "#334155" }}>Halte dem Kunden das Tablet direkt vor die Nase. Zahlen lügen nicht.</p>
                    </div>
                </div>
            ),
            target: ".tour-stats",
            placement: "bottom",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Deal abschließen 🚀</h3>
                    <p>Der Kunde ist überzeugt? Dann klicke auf "Jetzt loslegen", um den Auftrag zu erfassen.</p>
                </div>
            ),
            target: ".tour-new-order",
            placement: "top",
            spotlightClicks: true,
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Das Formular 📝</h3>
                    <p>Hier trägst du die Daten ein. Wir haben das für dich schon mal vorbereitet:</p>
                    <ul style={{ fontSize: 13, paddingLeft: 20, marginTop: 10, marginBottom: 10, color: "#475569" }}>
                        <li style={{ marginBottom: 4 }}><b>Firmenname:</b> {demoName}</li>
                        <li style={{ marginBottom: 4 }}><b>Ansprechpartner:</b> Max Mustermann</li>
                        <li><b>Kontakt:</b> max@example.com</li>
                    </ul>
                    <div style={{ marginTop: 20, fontWeight: 700, color: "#0b6cf2", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px" }}>Phase 2: Abschluss ✍️</div>
                </div>
            ),
            target: ".tour-form-inputs",
            placement: "left",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Automatisch ausgefüllt ✨</h3>
                    <p>Normalerweise tippst du hier kurz. Für die Demo übernehmen wir das.</p>
                    <p style={{ marginTop: 8, fontWeight: 600 }}>Klick auf "Weiter" geht zum Vertrag.</p>
                </div>
            ),
            target: ".tour-form-inputs",
            placement: "left",
        },

        // --- PHASE 3: SIGN & OVERVIEW ---
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Unterschrift ✍️</h3>
                    <p>Rechtsgültig und papierlos. Lass den Kunden direkt hier auf dem Bildschirm unterschreiben.</p>
                </div>
            ),
            target: ".tour-sign-pad",
            placement: "top",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Bestätigen ✅</h3>
                    <p>Ein Klick auf diesen Button, und der Auftrag ist sicher im System.</p>
                </div>
            ),
            target: ".tour-sign-submit",
            placement: "top",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Glückwunsch! 🎉</h3>
                    <p>Du hast deinen ersten (Demo-)Deal abgeschlossen! Schauen wir uns das Ergebnis an.</p>
                </div>
            ),
            target: "body",
            placement: "center",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Deine Auftragsliste 📋</h3>
                    <p>Hier würde der neue Auftrag für <b>{demoName}</b> erscheinen.</p>
                    <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Du siehst sofort den Status (z.B. "In Bearbeitung").</p>
                </div>
            ),
            target: ".tour-orders-list",
            placement: "top",
        },
        {
            content: (
                <div>
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Dein Erfolg 🏆</h3>
                    <p>Hier siehst du deine Provision wachsen. Das ist dein täglicher Motivations-Booster!</p>
                </div>
            ),
            target: ".tour-orders-stats",
            placement: "bottom",
        },
        {
            content: (
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, background: "linear-gradient(135deg, #0b6cf2 0%, #0044cc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Du bist bereit! 💎</h2>
                    <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>Du kennst jetzt den Prozess. Geh raus und hol dir die echten Deals.</p>
                    <div style={{ background: "#f8fafc", padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Nächster Schritt:</p>
                        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Fahre zu einem Gewerbegebiet und starte den Smart Scan.</p>
                    </div>
                </div>
            ),
            placement: "center",
            target: "body",
        },
    ];

    const handleCallback = async (data) => {
        const { action, index, status, type } = data;

        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRun(false);
            // Mark as seen
            const { data: { user } } = await supabase().auth.getUser();
            if (user) {
                await supabase()
                    .from("profiles")
                    .update({ tour_seen: true })
                    .eq("user_id", user.id);
            }
            return;
        }

        if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            const nextIndex = index + 1;

            // --- NAVIGATION & ACTION LOGIC ---

            // 1 -> 2: Go to Map
            if (index === 1) {
                router.push("/dashboard/map");
                setTimeout(() => setStepIndex(nextIndex), 800);
                return;
            }

            // 2 -> 3: Auto-Click Search
            if (index === 2) {
                const btn = document.querySelector(".tour-map-scan");
                if (btn) btn.click();
                setTimeout(() => setStepIndex(nextIndex), 500);
                return;
            }

            // 3 -> 4: Wait for Loading (Simulated)
            if (index === 3) {
                setTimeout(() => setStepIndex(nextIndex), 2500); // 2.5s loading animation
                return;
            }

            // 4 -> 5: Select Result (Mock Click)
            if (index === 4) {
                // Try to find a real card
                const card = document.querySelector(".place-card");
                if (card) {
                    card.click();
                    // Try to grab name from card
                    const nameEl = card.querySelector(".pc-name");
                    if (nameEl) setDemoName(nameEl.innerText);
                }
                setTimeout(() => setStepIndex(nextIndex), 800);
                return;
            }

            // 5 -> 6: Click "Simulator starten"
            if (index === 5) {
                const btn = document.querySelector(".btn-main"); // The simulator button in drawer
                if (btn) {
                    btn.click(); // This navigates to dashboard via router.push (fixed in MapPage)
                } else {
                    router.push("/dashboard"); // Fallback
                }
                // We need to wait for the dashboard to load
                setTimeout(() => setStepIndex(nextIndex), 1000);
                return;
            }

            // 6 -> 7: Dashboard Loaded -> Wait for Simulator Loading
            if (index === 6) {
                // Read name from session storage if possible
                try {
                    const raw = sessionStorage.getItem("sb_selected_profile");
                    if (raw) {
                        const p = JSON.parse(raw);
                        if (p.name) setDemoName(p.name);
                    }
                } catch { }

                // We do NOT emit sb:simulator-start here because MapPage already did the logic
                // But we might need to trigger the stats if the simulator doesn't auto-fetch in demo mode
                // Actually, the simulator might need a kick if it's not real data.
                // Assuming MapPage set the profile, DashboardPage will read it.
                // We just need to simulate the "Analysis" part.
                setTimeout(() => setStepIndex(nextIndex), 800);
                return;
            }

            // 7 -> 8: Simulator Loading Animation (5 seconds)
            if (index === 7) {
                setTimeout(() => {
                    // Now show stats (Simulated for demo purposes if real API fails or just to be sure)
                    const statsEvent = new CustomEvent("sb:stats", {
                        detail: { totalReviews: 42, averageRating: 2.8, breakdown: { 1: 15, 2: 5, 3: 2, 4: 5, 5: 15 } }
                    });
                    window.dispatchEvent(statsEvent);
                    setStepIndex(nextIndex);
                }, 5000); // 5 seconds wait
                return;
            }

            // 9 -> 10: Auto-Click "Loslegen"
            if (index === 9) {
                const btn = document.querySelector(".tour-new-order");
                if (btn) btn.click();
                setTimeout(() => setStepIndex(nextIndex), 800);
                return;
            }

            // 10 -> 11: Auto-Fill Form
            if (index === 10) {
                const formEvent = new CustomEvent("sb:fill-form", {
                    detail: {
                        company: demoName,
                        firstName: "Max",
                        lastName: "Mustermann",
                        email: "max@example.com",
                        phone: "+49 170 1234567"
                    }
                });
                window.dispatchEvent(formEvent);
                setTimeout(() => setStepIndex(nextIndex), 2500); // Give time to read
                return;
            }

            // 11 -> 12: Auto-Click "Weiter" (Submit Form)
            if (index === 11) {
                router.push("/sign");
                setTimeout(() => setStepIndex(nextIndex), 1000);
                return;
            }

            // 13 -> 14: Sign Page interaction

            // 14 -> 15: Go to Orders
            if (index === 14) {
                router.push("/dashboard/orders");
                setTimeout(() => setStepIndex(nextIndex), 800);
                return;
            }

            setStepIndex(nextIndex);
        }
    };

    // Custom Tooltip Component
    const Tooltip = ({
        continuous,
        index,
        step,
        backProps,
        closeProps,
        primaryProps,
        tooltipProps,
    }) => {
        // Phase Calculation
        let phase = 1;
        let phaseProgress = 0;

        // Phase 1: Steps 0-5 (Map)
        // Phase 2: Steps 6-11 (Simulator/Form)
        // Phase 3: Steps 12-16 (Sign/Orders)

        if (index <= 5) {
            phase = 1;
            phaseProgress = ((index + 1) / 6) * 100;
        } else if (index <= 11) {
            phase = 2;
            phaseProgress = ((index - 5) / 6) * 100;
        } else {
            phase = 3;
            phaseProgress = ((index - 11) / 5) * 100;
        }

        return (
            <div {...tooltipProps} style={{
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)", // Safari support
                borderRadius: 24,
                padding: 28,
                maxWidth: 440,
                width: "90vw", // Responsive width for mobile
                boxShadow: "0 25px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.5) inset",
                fontFamily: "'Inter', sans-serif",
                border: "1px solid rgba(255,255,255,0.8)"
            }}>
                {/* Progress Bar */}
                <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
                    {[1, 2, 3].map(p => (
                        <div key={p} style={{ flex: 1, height: 4, borderRadius: 2, background: "#e2e8f0", overflow: "hidden" }}>
                            <div style={{
                                height: "100%",
                                width: p < phase ? "100%" : (p === phase ? `${phaseProgress}%` : "0%"),
                                background: p <= phase ? "#0b6cf2" : "transparent",
                                transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                            }} />
                        </div>
                    ))}
                </div>

                <div style={{ marginBottom: 24, color: "#1e293b", lineHeight: 1.6 }}>
                    {step.content}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.5px" }}>
                        SCHRITT {index + 1} VON {steps.length}
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                        {index > 0 && (
                            <button {...backProps} style={{
                                border: "none", background: "transparent", color: "#64748b", fontWeight: 600, cursor: "pointer", padding: "8px 16px", fontSize: 14, transition: "color 0.2s"
                            }}>
                                Zurück
                            </button>
                        )}
                        <button {...primaryProps} style={{
                            border: "none", background: "#0b6cf2", color: "#fff", fontWeight: 700, cursor: "pointer",
                            padding: "12px 28px", borderRadius: 14, fontSize: 14, boxShadow: "0 4px 12px rgba(11, 108, 242, 0.25)",
                            transition: "transform 0.2s, box-shadow 0.2s"
                        }}>
                            {index === steps.length - 1 ? "Los geht's! 🚀" : "Weiter"}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (!run) return null;

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
            continuous
            showProgress
            showSkipButton
            callback={handleCallback}
            tooltipComponent={Tooltip}
            disableOverlayClose={true}
            spotlightClicks={true}
            scrollOffset={100}
            floaterProps={{
                disableAnimation: true,
            }}
            styles={{
                options: {
                    zIndex: 10000,
                    primaryColor: "#0b6cf2",
                },
                overlay: {
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(16px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(150%)', // Safari support
                },
                spotlight: {
                    borderRadius: 20,
                    boxShadow: "0 0 0 4px rgba(11, 108, 242, 0.3)"
                }
            }}
        />
    );
}
