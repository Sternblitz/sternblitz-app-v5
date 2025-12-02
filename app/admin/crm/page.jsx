"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    TrendingUp,
    Users,
    Euro, // Changed from DollarSign
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    Wallet,
    PieChart,
    CheckCircle,
    Hourglass
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend
} from 'recharts';

export default function DashboardPage() {
    const [stats, setStats] = useState({
        revenue: { total: 0, paid: 0, open: 0 },
        profit: { total: 0, paid: 0, open: 0 },
        activePartners: 0,
        revenueGrowth: 0
    });
    const [recentSales, setRecentSales] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);

            // 1. Fetch Orders
            const { data: orders, error: ordersError } = await supabase()
                .from("orders")
                .select("id, created_at, status, payment_status, commission_status, admin_stage, company, created_by")
                .order("created_at", { ascending: false });

            if (ordersError) {
                console.error("Error fetching orders:", ordersError);
            }

            // 2. Fetch Profiles
            const { data: profiles, error: profilesError } = await supabase()
                .from("profiles")
                .select("user_id, full_name");

            if (profilesError) console.error("Error fetching profiles:", profilesError);

            const profileMap = {};
            if (profiles) {
                profiles.forEach(p => profileMap[p.user_id] = p);
            }

            if (orders) {
                // --- KPI Calculation ---
                const now = new Date();
                const currentMonth = now.getMonth();
                const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;

                // Metrics
                let revTotal = 0, revPaid = 0, revOpen = 0;
                let profTotal = 0, profPaid = 0, profOpen = 0;

                let revCurrentMonth = 0;
                let revLastMonth = 0;

                // Chart Data Preparation (Last 30 days)
                const dailyStats = {};
                for (let i = 29; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    dailyStats[d.toLocaleDateString("de-DE")] = { revenue: 0, profit: 0 };
                }

                const activeSet = new Set();
                const enrichedOrders = [];

                orders.forEach(o => {
                    // Enrich with profile
                    const profile = profileMap[o.created_by];
                    const fullOrder = { ...o, profiles: profile || { full_name: 'Unbekannt' } };
                    enrichedOrders.push(fullOrder);

                    const d = new Date(o.created_at);
                    const isCancelled = o.status === 'CANCELLED' || o.status === 'REJECTED';

                    if (isCancelled) return;

                    // Values per Deal
                    const dealRevenue = 299;
                    const dealProfit = 100; // User defined: 100€ Profit

                    // Payment Status Logic: Paid if Stripe says so OR if Admin moved to DONE
                    const isPaid = o.payment_status === 'paid' || o.admin_stage === 'DONE';

                    // Total Aggregation
                    revTotal += dealRevenue;
                    profTotal += dealProfit;

                    if (isPaid) {
                        revPaid += dealRevenue;
                        profPaid += dealProfit;
                    } else {
                        revOpen += dealRevenue;
                        profOpen += dealProfit;
                    }

                    // Growth Calculation (Monthly Revenue)
                    if (d.getMonth() === currentMonth) revCurrentMonth += dealRevenue;
                    if (d.getMonth() === lastMonth) revLastMonth += dealRevenue;

                    // Active Partners Logic
                    const diffTime = Math.abs(now - d);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays <= 30 && profile?.full_name) {
                        activeSet.add(profile.full_name);
                    }

                    // Chart Aggregation (Last 30 Days)
                    const dateStr = d.toLocaleDateString("de-DE");
                    if (dailyStats[dateStr]) {
                        dailyStats[dateStr].revenue += dealRevenue;
                        dailyStats[dateStr].profit += dealProfit;
                    }
                });

                // Growth
                const growth = revLastMonth > 0 ? ((revCurrentMonth - revLastMonth) / revLastMonth) * 100 : 100;

                setStats({
                    revenue: { total: revTotal, paid: revPaid, open: revOpen },
                    profit: { total: profTotal, paid: profPaid, open: profOpen },
                    activePartners: activeSet.size,
                    revenueGrowth: growth
                });

                setRecentSales(enrichedOrders.slice(0, 5));
                setChartData(Object.entries(dailyStats).map(([name, values]) => ({ name: name.slice(0, 5), ...values })));
            }
            setLoading(false);
        };

        loadData();

        // Realtime Ticker
        const channel = supabase()
            .channel('dashboard-ticker')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
                // Fetch new order
                const { data: newOrder } = await supabase().from("orders").select("*").eq("id", payload.new.id).single();
                if (newOrder) {
                    // Fetch profile for new order
                    const { data: profile } = await supabase().from("profiles").select("full_name").eq("user_id", newOrder.created_by).single();
                    const enriched = { ...newOrder, profiles: profile || { full_name: 'Unbekannt' } };
                    setRecentSales(prev => [enriched, ...prev].slice(0, 5));
                }
            })
            .subscribe();

        return () => { supabase().removeChannel(channel); };
    }, []);

    const MetricCard = ({ title, value, sub, icon: Icon, colorClass }) => (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
                <div className={`p-2.5 rounded-xl ${colorClass}`}>
                    <Icon size={20} />
                </div>
            </div>
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
        </div>
    );

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
                <p className="text-slate-500 mt-1">Finanz-Überblick & Performance</p>
            </div>

            {/* Revenue Section */}
            <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Euro size={16} className="text-indigo-600" />
                    Umsatz (Revenue)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <MetricCard
                        title="Gesamtumsatz"
                        value={`${stats.revenue.total.toLocaleString()} €`}
                        sub="Alle aktiven Deals (299€)"
                        icon={Euro}
                        colorClass="bg-indigo-50 text-indigo-600"
                    />
                    <MetricCard
                        title="Bezahlter Umsatz"
                        value={`${stats.revenue.paid.toLocaleString()} €`}
                        sub="Geld auf dem Konto"
                        icon={CheckCircle}
                        colorClass="bg-emerald-50 text-emerald-600"
                    />
                    <MetricCard
                        title="Offener Umsatz"
                        value={`${stats.revenue.open.toLocaleString()} €`}
                        sub="Noch ausstehend"
                        icon={Hourglass}
                        colorClass="bg-amber-50 text-amber-600"
                    />
                </div>
            </div>

            {/* Profit Section */}
            <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Wallet size={16} className="text-emerald-600" />
                    Profit (Gewinn)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <MetricCard
                        title="Gesamtprofit"
                        value={`${stats.profit.total.toLocaleString()} €`}
                        sub="Kalkuliert mit 100€/Deal"
                        icon={Wallet}
                        colorClass="bg-emerald-50 text-emerald-600"
                    />
                    <MetricCard
                        title="Realisierter Profit"
                        value={`${stats.profit.paid.toLocaleString()} €`}
                        sub="Aus bezahlten Deals"
                        icon={CheckCircle}
                        colorClass="bg-emerald-100 text-emerald-700"
                    />
                    <MetricCard
                        title="Erwarteter Profit"
                        value={`${stats.profit.open.toLocaleString()} €`}
                        sub="Aus offenen Deals"
                        icon={TrendingUp}
                        colorClass="bg-blue-50 text-blue-600"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Chart: Revenue vs Profit */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Umsatz & Profit (30 Tage)</h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="revenue" name="Umsatz" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                <Area type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Live Ticker */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[440px]">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        Live Sales Ticker
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {recentSales.map((sale) => (
                            <div key={sale.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 animate-in slide-in-from-right duration-300">
                                <div className="bg-white p-2 rounded-lg shadow-sm text-emerald-600">
                                    <Euro size={16} />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900">
                                        {sale.company || "Unbekannt"}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        verkauft von <span className="font-medium text-indigo-600">{sale.profiles?.full_name || "Jemandem"}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                        <Clock size={10} />
                                        {new Date(sale.created_at).toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' })} Uhr
                                    </div>
                                </div>
                                <div className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                    +100€ Profit
                                </div>
                            </div>
                        ))}
                        {recentSales.length === 0 && (
                            <div className="text-center text-slate-400 text-sm py-10">
                                Noch keine Sales heute.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
