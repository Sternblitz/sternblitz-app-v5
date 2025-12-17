"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Settings,
  LogOut,
  Menu,
  X,
  Zap,
  Activity
} from "lucide-react";

export default function AdminCrmLayout({ children }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session) {
        if (mounted) {
          setLoading(false);
          router.replace("/login");
        }
        return;
      }

      const { data: profile } = await supabase()
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (mounted) {
        if (profile?.role === "ADMIN" || profile?.role === "MANAGER") {
          setAuthorized(true);
          setRole(profile.role);
        } else {
          router.replace("/dashboard");
        }
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400 font-sans">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );

  if (!authorized) return null;

  const allNavItems = [
    { label: "Dashboard", href: "/admin/crm", icon: LayoutDashboard, exact: true, roles: ["ADMIN"] },
    { label: "Deals & Pipeline", href: "/admin/crm/deals", icon: Briefcase, roles: ["ADMIN", "MANAGER"] },
    { label: "Team & HR", href: "/admin/crm/team", icon: Users, roles: ["ADMIN"] },
    { label: "Recruiting", href: "/admin/crm/recruiting", icon: Zap, roles: ["ADMIN"] },
    { label: "Aktivitäten", href: "/admin/crm/activities", icon: Activity, roles: ["ADMIN"] },
    { label: "Kanban Board", href: "/admin/crm/kanban", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER"] },
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(role));

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-[280px] bg-white border-r border-slate-200 z-50 flex flex-col transition-transform duration-300
        ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Zap size={20} fill="currentColor" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">Sternblitz</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin OS</div>
          </div>
          <button className="ml-auto lg:hidden text-slate-400" onClick={() => setMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <div className="px-4 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Main</div>
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group
                  ${isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }
                `}
              >
                <item.icon size={20} className={isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"} />
                {item.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors">
            <LogOut size={20} />
            Zurück zur App
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between sticky top-0 z-30">
          <div className="font-bold text-lg">Admin Cockpit</div>
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-600">
            <Menu size={24} />
          </button>
        </div>

        <div className="p-4 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
