"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    Trophy, Medal, Users, DollarSign, TrendingUp,
    Search, Filter, MoreHorizontal, X, CheckCircle,
    CreditCard, User, Building2, Phone, Mail, MapPin,
    ArrowRight, Crown, Star
} from "lucide-react";

// --- Helper Components ---

function RankBadge({ count }) {
    if (count >= 50) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                <Crown size={12} /> Elite
            </span>
        );
    }
    if (count >= 10) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <Star size={12} /> Senior
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Junior
        </span>
    );
}

function PartnerDrawer({ partner, stats, hr, deals, onClose, onUpdateHr, onPayAll, onToggleCommission }) {
    const [iban, setIban] = useState(hr?.iban || "");
    const [paypal, setPaypal] = useState(hr?.paypal || "");
    const [saving, setSaving] = useState(false);
    const [paying, setPaying] = useState(false);

    const handleSaveHr = async () => {
        setSaving(true);
        await onUpdateHr(partner.user_id, { iban, paypal });
        setSaving(false);
    };

    const handlePayAll = async () => {
        if (!confirm(`Alle offenen Provisionen (${stats.openComm}€) für ${partner.full_name} als BEZAHLT markieren?`)) return;
        setPaying(true);
        await onPayAll(partner.user_id);
        setPaying(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-indigo-200">
                            {partner.full_name?.[0]}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">{partner.full_name}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <RankBadge count={stats.count} />
                                <span className="text-slate-400 text-sm">•</span>
                                <span className="text-slate-500 text-sm">Dabei seit {new Date(partner.created_at).toLocaleDateString("de-DE")}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* KPI Grid */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Deals Gesamt</div>
                            <div className="text-2xl font-bold text-slate-900">{stats.count}</div>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="text-emerald-600 text-xs font-bold uppercase mb-1">Ausbezahlt</div>
                            <div className="text-2xl font-bold text-emerald-700">{stats.paidComm} €</div>
                        </div>
                        <div className="p-4 bg-white rounded-xl border-2 border-indigo-100 shadow-sm">
                            <div className="text-indigo-600 text-xs font-bold uppercase mb-1">Offene Provision</div>
                            <div className="text-2xl font-bold text-indigo-700">{stats.openComm} €</div>
                            {stats.openComm > 0 && (
                                <button
                                    onClick={handlePayAll}
                                    disabled={paying}
                                    className="mt-3 w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                                >
                                    {paying ? "Zahle..." : "Alles auszahlen"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* HR / Payment Data */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <CreditCard size={16} className="text-slate-400" />
                            Zahlungsdaten
                        </h3>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IBAN</label>
                                    <input
                                        className="w-full p-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        placeholder="DE..."
                                        value={iban}
                                        onChange={e => setIban(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PayPal</label>
                                    <input
                                        className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        placeholder="email@paypal.com"
                                        value={paypal}
                                        onChange={e => setPaypal(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={handleSaveHr}
                                    disabled={saving}
                                    className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                                >
                                    {saving ? "Speichert..." : "Daten speichern"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Deal History */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <TrendingUp size={16} className="text-slate-400" />
                            Deal Historie
                        </h3>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Firma</th>
                                        <th className="p-3">Datum</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right">Prov.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {deals.map(deal => (
                                        <tr key={deal.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-900">{deal.company}</td>
                                            <td className="p-3 text-slate-500">{new Date(deal.created_at).toLocaleDateString("de-DE")}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${deal.admin_stage === 'DONE' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                    deal.admin_stage === 'SUCCESS_OPEN' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        'bg-slate-100 text-slate-600 border-slate-200'
                                                    }`}>
                                                    {deal.admin_stage}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onToggleCommission(deal); }}
                                                    className={`font-bold flex items-center justify-end gap-1 px-2 py-1 rounded transition-colors ${deal.commission_status === 'PAID'
                                                        ? "text-emerald-600 hover:bg-emerald-50"
                                                        : deal.admin_stage === 'DONE'
                                                            ? "text-indigo-600 hover:bg-indigo-50"
                                                            : "text-slate-300 cursor-not-allowed"
                                                        }`}
                                                    disabled={deal.admin_stage !== 'DONE' && deal.commission_status !== 'PAID'}
                                                    title={deal.commission_status === 'PAID' ? "Als unbezahlt markieren" : "Als bezahlt markieren"}
                                                >
                                                    {deal.commission_status === 'PAID' ? (
                                                        <><CheckCircle size={14} /> 100€</>
                                                    ) : deal.admin_stage === 'DONE' ? (
                                                        <><span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600"></span> 100€</>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {deals.length === 0 && (
                                        <tr><td colSpan="4" className="p-8 text-center text-slate-400">Keine Deals gefunden.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

// --- Main Page ---

export default function TeamPage() {
    const [profiles, setProfiles] = useState([]);
    const [hrDetails, setHrDetails] = useState({});
    const [orders, setOrders] = useState([]);
    const [timeFilter, setTimeFilter] = useState("ALL"); // 'ALL' | 'MONTH'
    const [loading, setLoading] = useState(true);
    const [selectedPartner, setSelectedPartner] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    const loadData = async () => {
        setLoading(true);

        // 1. Fetch Profiles
        const { data: profs } = await supabase()
            .from("profiles")
            .select("*, teams(name)")
            .order("full_name");

        // 2. Fetch HR Details
        const { data: hr } = await supabase().from("hr_partner_details").select("*");
        const hrMap = {};
        if (hr) hr.forEach(h => hrMap[h.user_id] = h);
        setHrDetails(hrMap);

        // 3. Fetch Orders
        const { data: ords } = await supabase()
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false });

        setOrders(ords || []);
        setProfiles(profs || []);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Compute Stats based on Filter
    const stats = useMemo(() => {
        const map = {};
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        orders.forEach(o => {
            if (!o.created_by) return;
            if (!map[o.created_by]) map[o.created_by] = { count: 0, openComm: 0, paidComm: 0 };

            const d = new Date(o.created_at);
            const isThisMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;

            // Count & PaidComm depend on Filter
            if (timeFilter === 'ALL' || isThisMonth) {
                map[o.created_by].count++;
                if (o.commission_status === 'PAID') {
                    map[o.created_by].paidComm += 100;
                }
            }

            // Open Commission is ALWAYS total (debt is debt)
            if (o.admin_stage === 'DONE' && o.commission_status !== 'PAID') {
                map[o.created_by].openComm += 100;
            }
        });
        return map;
    }, [orders, timeFilter]);

    // Partner Deals Map (for Drawer)
    const partnerDeals = useMemo(() => {
        const map = {};
        orders.forEach(o => {
            if (!o.created_by) return;
            if (!map[o.created_by]) map[o.created_by] = [];
            map[o.created_by].push(o);
        });
        return map;
    }, [orders]);

    const handleUpdateHr = async (userId, data) => {
        const payload = {
            user_id: userId,
            iban: data.iban,
            paypal: data.paypal,
            updated_at: new Date().toISOString()
        };
        const { error } = await supabase().from("hr_partner_details").upsert(payload);
        if (error) console.error(error);
        else {
            setHrDetails(prev => ({ ...prev, [userId]: { ...prev[userId], ...payload } }));
        }
    };

    const handlePayAll = async (userId) => {
        // Find all open deals for this user
        const userDeals = partnerDeals[userId] || [];
        const openDealIds = userDeals
            .filter(d => d.admin_stage === 'DONE' && d.commission_status !== 'PAID')
            .map(d => d.id);

        if (openDealIds.length === 0) return;

        // Update local state immediately
        setOrders(prev => prev.map(o =>
            openDealIds.includes(o.id) ? { ...o, commission_status: 'PAID', status: 'COMMISSION_PAID' } : o
        ));

        // Background update
        const { error } = await supabase()
            .from("orders")
            .update({ commission_status: 'PAID', status: 'COMMISSION_PAID' })
            .in("id", openDealIds);

        if (error) {
            console.error(error);
            // Revert on error (optional, but good practice)
            loadData();
        }
    };

    const handleToggleCommission = async (deal) => {
        const newStatus = deal.commission_status === 'PAID' ? 'OPEN' : 'PAID';
        const newOrderStatus = newStatus === 'PAID' ? 'COMMISSION_PAID' : 'PAID_DELETED'; // Revert to PAID_DELETED if unpaid

        // Optimistic Update
        setOrders(prev => prev.map(o =>
            o.id === deal.id ? { ...o, commission_status: newStatus, status: newOrderStatus } : o
        ));

        const { error } = await supabase()
            .from("orders")
            .update({ commission_status: newStatus, status: newOrderStatus })
            .eq("id", deal.id);

        if (error) {
            console.error(error);
            loadData();
        }
    };

    // Filter & Sort
    const filteredProfiles = useMemo(() => {
        return profiles
            .filter(p => p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => (stats[b.user_id]?.count || 0) - (stats[a.user_id]?.count || 0));
    }, [profiles, searchTerm, stats]);

    const top3 = filteredProfiles.slice(0, 3);

    return (
        <div className="min-h-screen pb-20">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">The Army</h1>
                    <p className="text-slate-500">Vertriebs-Performance & Provisionen</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
                        <button
                            onClick={() => setTimeFilter("MONTH")}
                            className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${timeFilter === 'MONTH' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Dieser Monat
                        </button>
                        <button
                            onClick={() => setTimeFilter("ALL")}
                            className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${timeFilter === 'ALL' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Gesamt
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Partner suchen..."
                            className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {/* Podium */}
            {!loading && !searchTerm && (
                <div className="grid grid-cols-3 gap-6 mb-10 items-end max-w-4xl mx-auto">
                    {/* Silver */}
                    {top3[1] && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center relative mt-8">
                            <div className="absolute -top-4 w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center font-bold text-white border-4 border-slate-50 shadow-sm">2</div>
                            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xl font-bold mb-3">
                                {top3[1].full_name[0]}
                            </div>
                            <div className="font-bold text-slate-900">{top3[1].full_name}</div>
                            <div className="text-slate-500 text-sm mb-2">{stats[top3[1].user_id]?.count || 0} Deals</div>
                            <div className="text-indigo-600 font-bold text-lg">{stats[top3[1].user_id]?.paidComm || 0} €</div>
                        </div>
                    )}
                    {/* Gold */}
                    {top3[0] && (
                        <div className="bg-gradient-to-b from-amber-50 to-white p-8 rounded-2xl shadow-lg border border-amber-100 flex flex-col items-center relative z-10 transform -translate-y-4">
                            <div className="absolute -top-6">
                                <Trophy size={48} className="text-amber-400 drop-shadow-sm" />
                            </div>
                            <div className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-3xl font-bold mb-4 mt-4 border-4 border-white shadow-sm">
                                {top3[0].full_name[0]}
                            </div>
                            <div className="font-bold text-slate-900 text-lg">{top3[0].full_name}</div>
                            <div className="text-amber-600 font-bold mb-2 flex items-center gap-1">
                                <Crown size={14} /> Elite Partner
                            </div>
                            <div className="text-slate-500 text-sm mb-1">{stats[top3[0].user_id]?.count || 0} Deals</div>
                            <div className="text-slate-900 font-bold text-2xl">{stats[top3[0].user_id]?.paidComm || 0} €</div>
                        </div>
                    )}
                    {/* Bronze */}
                    {top3[2] && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center relative mt-12">
                            <div className="absolute -top-4 w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center font-bold text-orange-800 border-4 border-slate-50 shadow-sm">3</div>
                            <div className="w-16 h-16 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xl font-bold mb-3">
                                {top3[2].full_name[0]}
                            </div>
                            <div className="font-bold text-slate-900">{top3[2].full_name}</div>
                            <div className="text-slate-500 text-sm mb-2">{stats[top3[2].user_id]?.count || 0} Deals</div>
                            <div className="text-indigo-600 font-bold text-lg">{stats[top3[2].user_id]?.paidComm || 0} €</div>
                        </div>
                    )}
                </div>
            )}

            {/* Army List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                        <tr>
                            <th className="p-5">Partner</th>
                            <th className="p-5 text-right">Deals</th>
                            <th className="p-5 text-right">Offen</th>
                            <th className="p-5 text-right">Bezahlt</th>
                            <th className="p-5 text-center">Status</th>
                            <th className="p-5"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan="6" className="p-10 text-center text-slate-400">Lade Truppen...</td></tr>
                        ) : filteredProfiles.map(p => {
                            const s = stats[p.user_id] || { count: 0, openComm: 0, paidComm: 0 };
                            return (
                                <tr key={p.user_id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setSelectedPartner(p)}>
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                                                {p.full_name?.[0]}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900">{p.full_name}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <RankBadge count={s.count} />
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5 text-right font-medium text-slate-700">{s.count}</td>
                                    <td className="p-5 text-right font-medium">
                                        {s.openComm > 0 ? (
                                            <span className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg font-bold">{s.openComm} €</span>
                                        ) : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="p-5 text-right font-medium text-emerald-600">{s.paidComm > 0 ? `${s.paidComm} €` : "-"}</td>
                                    <td className="p-5 text-center">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" title="Aktiv"></span>
                                    </td>
                                    <td className="p-5 text-right">
                                        <button className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100">
                                            <ArrowRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Drawer */}
            {selectedPartner && (
                <PartnerDrawer
                    partner={selectedPartner}
                    stats={stats[selectedPartner.user_id] || { count: 0, openComm: 0, paidComm: 0 }}
                    hr={hrDetails[selectedPartner.user_id]}
                    deals={partnerDeals[selectedPartner.user_id] || []}
                    onClose={() => setSelectedPartner(null)}
                    onUpdateHr={handleUpdateHr}
                    onPayAll={handlePayAll}
                    onToggleCommission={handleToggleCommission}
                />
            )}
        </div>
    );
}
