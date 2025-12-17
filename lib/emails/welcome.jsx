export const WelcomeEmail = ({ name, teamName, loginUrl }) => (
    <div style={{ fontFamily: "sans-serif", backgroundColor: "#f8fafc", padding: "40px 20px" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>

            {/* Header */}
            <div style={{ backgroundColor: "#0f172a", padding: "32px 40px", textAlign: "center" }}>
                <h1 style={{ color: "#ffffff", margin: 0, fontSize: "24px", fontWeight: "800" }}>Willkommen im Team! 🚀</h1>
            </div>

            {/* Body */}
            <div style={{ padding: "40px" }}>
                <p style={{ fontSize: "16px", color: "#334155", lineHeight: "1.6", margin: "0 0 24px" }}>
                    Hey <strong>{name}</strong>,
                </p>
                <p style={{ fontSize: "16px", color: "#334155", lineHeight: "1.6", margin: "0 0 24px" }}>
                    Willkommen bei <strong>Sternblitz</strong>! Du bist jetzt offiziell Teil von <strong>{teamName}</strong>.
                </p>
                <p style={{ fontSize: "16px", color: "#334155", lineHeight: "1.6", margin: "0 0 32px" }}>
                    Dein Account ist eingerichtet und startklar. Du kannst sofort loslegen, deine ersten Leads scannen und Aufträge schreiben.
                </p>

                {/* CTA Button */}
                <div style={{ textAlign: "center", margin: "32px 0" }}>
                    <a href={loginUrl} style={{ backgroundColor: "#0b6cf2", color: "#ffffff", padding: "16px 32px", borderRadius: "12px", textDecoration: "none", fontWeight: "700", fontSize: "16px", display: "inline-block" }}>
                        Zum Dashboard →
                    </a>
                </div>

                <div style={{ backgroundColor: "#f1f5f9", padding: "20px", borderRadius: "12px", marginTop: "32px" }}>
                    <p style={{ margin: "0 0 8px", fontWeight: "700", color: "#0f172a", fontSize: "14px" }}>⚡ Erste Schritte:</p>
                    <ul style={{ margin: 0, paddingLeft: "20px", color: "#475569", fontSize: "14px", lineHeight: "1.6" }}>
                        <li>Logge dich ein</li>
                        <li>Checke die Karte für Leads in deiner Nähe</li>
                        <li>Starte deinen ersten Verkauf!</li>
                    </ul>
                </div>
            </div>

            {/* Footer */}
            <div style={{ backgroundColor: "#f8fafc", padding: "24px 40px", textAlign: "center", borderTop: "1px solid #e2e8f0" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
                    © {new Date().getFullYear()} Sternblitz. Let's rock this! 🎸
                </p>
            </div>
        </div>
    </div>
);
