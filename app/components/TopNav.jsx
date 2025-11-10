// components/TopNav.jsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function TopNav() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await supabase().auth.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      sessionStorage.clear();
      localStorage.clear();
      router.replace("/login");
    }
  };

  return (
    <>
      <nav className="sb-topnav">
        <div className="inner">
          {/* Logo */}
          <button
            type="button"
            className="brand"
            onClick={() => router.push("/dashboard")}
            aria-label="Sternblitz Dashboard"
          >
            <img
              src="https://cdn.prod.website-files.com/6899bdb7664b4bd2cbd18c82/68ad4679902a5d278c4cf0bc_Group%202085662922-p-500.png"
              alt="Sternblitz"
              className="logo"
            />
          </button>

          {/* Buttons rechts */}
          <div className="actions">
            <button
              type="button"
              className="btn orders"
              onClick={() => router.push("/dashboard/orders")}
            >
              📄 Meine&nbsp;Aufträge
            </button>

            <button type="button" className="btn logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="spacer" />

      <style jsx>{`
        /* Grundlayout */
        .sb-topnav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px) saturate(1.2);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.04);
        }
        /* For sticky nav we don't need extra offset */
        .spacer { height: 0; }
        .inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 14px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        /* Logo (als Button, ohne Rahmen/Hintergrund) */
        .brand {
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          cursor: pointer;
        }
        .logo {
          height: 52px;
          width: auto;
          object-fit: contain;
          transition: transform 0.2s ease;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08));
        }
        .brand:hover .logo {
          transform: scale(1.04);
        }

        /* Buttons rechts */
        .actions {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        /* Basis-Button */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 20px;
          height: 44px;
          border-radius: 999px;
          font-weight: 800;
          font-size: 15px;
          letter-spacing: 0.2px;
          cursor: pointer;
          border: none;
          text-decoration: none;
          transition: all 0.18s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        /* 💙 Meine Aufträge – kräftiger, leuchtend blau (Card-Look) */
        .btn.orders {
          background: linear-gradient(135deg, #0b6cf2 0%, #3b82f6 100%);
          color: #ffffff;
          box-shadow: 0 8px 22px rgba(11, 108, 242, 0.28);
          border: 1px solid rgba(11, 108, 242, 0.25);
        }
        .btn.orders:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 12px 28px rgba(11, 108, 242, 0.35);
        }
        .btn.orders:active {
          transform: translateY(0);
          filter: brightness(0.96);
        }

        /* Logout – dezent, elegant grau */
        .btn.logout {
          background: #f5f5f7;
          color: #111;
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
          font-weight: 700;
        }
        .btn.logout:hover {
          background: #e8e8ea;
          transform: translateY(-1px);
        }

        /* Responsiv */
        @media (max-width: 900px) {
          .inner { padding: 12px 18px; }
          .logo { height: 44px; }
          .btn { height: 40px; padding: 0 16px; font-size: 14px; }
        }
        @media (max-width: 640px) {
          .inner { padding: 10px 14px; }
          .logo { height: 38px; }
          .actions { gap: 8px; }
          .btn { height: 38px; padding: 0 14px; font-size: 13.5px; }
        }
      `}</style>
    </>
  );
}
