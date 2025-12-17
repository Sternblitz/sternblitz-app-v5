"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
    Users, Activity, Calendar, Clock, Filter, Search, User
} from "lucide-react";

export default function ActivitiesDashboard() {
    const [activities, setActivities] = useState([]);
    const [allProfiles, setAllProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null); // null = all
    const [timeRange, setTimeRange] = useState("7d"); // "24h", "7d", "30d"

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all profiles (Sales Reps + Team Leaders + Admins)
            // We rely on the new RLS policy allowing Admins to see this.
            const { data: profiles } = await supabase()
                .from("profiles")
                .select("user_id, full_name, role")
                .in('role', ['SALES', 'TEAM_LEADER', 'ADMIN'])
                .order('full_name', { ascending: true });

            if (profiles) setAllProfiles(profiles);

            // 2. Fetch activity
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30); // Get enough data

            const { data, error } = await supabase()
                .from("user_activities")
                .select(`
          *,
          profiles:user_id ( full_name, role )
        `)
                .gte("created_at", cutoff.toISOString())
                .order("created_at", { ascending: false })
                .limit(3000);

            if (error) throw error;
            setActivities(data || []);
        } catch (err) {
            console.error("Error fetching dashboard data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Aggregation Logic ---

    // 1. User Stats Table (Left Sidebar)
    const userStats = useMemo(() => {
        const stats = {};
        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;
        const sevenDays = 7 * oneDay;

        // Init stats for ALL profiles ensures we show inactive users
        allProfiles.forEach(p => {
            stats[p.user_id] = {
                id: p.user_id,
                name: p.full_name || "Unbekannt",
                role: p.role,
                count24h: 0,
                count7d: 0,
                total: 0,
                lastActive: 0
            };
        });

        // Aggregate
        activities.forEach(a => {
            const uid = a.user_id;
            if (!stats[uid]) {
                // Fallback if we have activity for a deleted/unknown user
                stats[uid] = {
                    id: uid,
                    name: a.profiles?.full_name || "Unbekannt",
                    role: a.profiles?.role,
                    count24h: 0, count7d: 0, total: 0, lastActive: 0
                };
            }

            const ts = new Date(a.created_at).getTime();
            const age = now.getTime() - ts;

            stats[uid].total++;
            if (age < oneDay) stats[uid].count24h++;
            if (age < sevenDays) stats[uid].count7d++;
            if (ts > stats[uid].lastActive) stats[uid].lastActive = ts;
        });

        return Object.values(stats).sort((a, b) => b.count7d - a.count7d);
    }, [activities, allProfiles]);

    // 2. Graph Data (Multi-Line)
    const graphData = useMemo(() => {
        const buckets = {};
        const isHourly = timeRange === "24h";
        const now = new Date();

        // Helper to generate keys
        const getKey = (d) => {
            if (isHourly) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        };

        // Pre-fill buckets
        const data = [];
        if (isHourly) {
            for (let i = 23; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 60 * 60 * 1000);
                const key = getKey(d);
                data.push({ name: key, total: 0, timestamp: d.getTime() });
                buckets[key] = data[data.length - 1];
            }
        } else {
            const days = timeRange === "7d" ? 7 : 30;
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = getKey(d);
                data.push({ name: key, total: 0, timestamp: d.getTime() });
                buckets[key] = data[data.length - 1];
            }
        }

        // Filter activities by time range roughly first
        let relevantActivities = activities;
        // We filter strictly for the graph aggregation
        const cutoff = new Date();
        if (isHourly) cutoff.setTime(now.getTime() - 24 * 60 * 60 * 1000);
        else if (timeRange === "7d") cutoff.setDate(now.getDate() - 7);
        else cutoff.setDate(now.getDate() - 30);

        relevantActivities = activities.filter(a => new Date(a.created_at) >= cutoff);

        // Fill buckets
        relevantActivities.forEach(a => {
            const d = new Date(a.created_at);
            const key = getKey(d);
            if (buckets[key]) {
                buckets[key].total++;
                // Increment per user
                if (!buckets[key][a.user_id]) buckets[key][a.user_id] = 0;
                buckets[key][a.user_id]++;
            }
        });

        return data;
    }, [activities, timeRange]);

    // 3. Filtered Feed
    const feed = useMemo(() => {
        let list = activities;
        const now = new Date();
        const cutoff = new Date();

        // Time filter
        if (timeRange === "24h") cutoff.setTime(now.getTime() - 24 * 60 * 60 * 1000);
        else if (timeRange === "7d") cutoff.setDate(now.getDate() - 7);
        else cutoff.setDate(now.getDate() - 30);

        list = list.filter(a => new Date(a.created_at) >= cutoff);

        // User filter
        if (selectedUser) list = list.filter(a => a.user_id === selectedUser);

        return list;
    }, [activities, selectedUser, timeRange]);


    const formatDate = (ts) => new Date(ts).toLocaleString("de-DE", {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const getMetadataPreview = (meta, type) => {
        if (!meta) return null;
        if (type === "SIMULATOR_CALC") {
            const inputs = meta.inputs || {};
            const company = inputs.company || "Unbekannt";
            const reviews = meta.totalReviews || "?";
            return `Ergebnis für: ${company} (${reviews} Reviews)`;
        }
        if (type === "SIMULATOR_SEARCH") {
            const q = meta.query || "";
            const addr = meta.address || "";
            return `Sucht nach: ${q} ${addr ? `(${addr})` : ""}`;
        }
        if (type === "LOGIN") return "Login erfolgreich";
        return null;
    };

    return (
        <div className="min-h-screen pb-20">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Aktivitäten & Performance</h1>
                    <p className="text-slate-500">Live-Tracking der Vertriebsaktivitäten</p>
                </div>
                <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    {["24h", "7d", "30d"].map(r => (
                        <button
                            key={r}
                            onClick={() => setTimeRange(r)}
                            className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${timeRange === r ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:text-slate-900"
                                }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {/* Top Graph */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                    Aktivitätsvolumen ({timeRange})
                </h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={graphData}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} minTickGap={30} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                                itemSorter={(a) => -a.value}
                            />

                            {/* Render faint line for EVERY user (always visible when "All" is selected) */}
                            {!selectedUser && allProfiles.map((p, i) => (
                                <Line
                                    key={p.user_id}
                                    type="monotone"
                                    dataKey={p.user_id}
                                    name={p.full_name}
                                    stroke="#e2e8f0" // Very light numeric slate
                                    strokeWidth={1.5}
                                    dot={false}
                                    activeDot={{ r: 4, stroke: '#cbd5e1', strokeWidth: 1 }}
                                    connectNulls
                                    opacity={0.8}
                                />
                            ))}

                            {/* Main Line: Either Selected User OR Total Activity */}
                            {selectedUser ? (
                                <Line
                                    type="monotone"
                                    dataKey={selectedUser}
                                    name={allProfiles.find(p => p.user_id === selectedUser)?.full_name || "User"}
                                    stroke="#4f46e5"
                                    strokeWidth={4}
                                    dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 7, strokeWidth: 0 }}
                                />
                            ) : (
                                <Line
                                    type="monotone"
                                    dataKey="total"
                                    name="Gesamt"
                                    stroke="#4f46e5" // indigo-600
                                    strokeWidth={4}
                                    dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 7, strokeWidth: 0 }}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left: User List */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <span className="font-bold text-slate-700">Vertriebler</span>
                            <span className="text-xs font-bold text-slate-400 uppercase">24h / 7d</span>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto">
                            <div
                                onClick={() => setSelectedUser(null)}
                                className={`p-4 border-b border-slate-50 cursor-pointer transition-colors flex items-center justify-between ${selectedUser === null ? "bg-indigo-50/50" : "hover:bg-slate-50"
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">ALL</div>
                                    <span className="font-bold text-slate-700">Alle anzeigen</span>
                                </div>
                            </div>
                            {userStats.map(u => (
                                <div
                                    key={u.id}
                                    onClick={() => setSelectedUser(u.id)}
                                    className={`p-4 border-b border-slate-50 cursor-pointer transition-colors flex items-center justify-betweenGroup ${selectedUser === u.id ? "bg-indigo-50/50" : "hover:bg-slate-50"
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${u.count24h > 0 ? "bg-indigo-600" : "bg-slate-300"
                                            }`}>
                                            {u.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm leading-tight">{u.name}</div>
                                            <div className="text-[10px] uppercase font-bold text-slate-400">{u.role}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-bold ${u.count24h > 0 ? "text-indigo-600" : "text-slate-300"}`}>
                                            {u.count24h}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-medium">{u.count7d} / 7d</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Feed */}
                <div className="lg:col-span-8">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <span className="font-bold text-slate-700">Live Feed ({feed.length})</span>
                        </div>

                        {feed.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">Keine Aktivitäten im gewählten Zeitraum.</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {feed.slice(0, 100).map(a => (
                                    <div key={a.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-4 items-start animate-in fade-in slide-in-from-bottom-1 duration-300">
                                        <div className={`
                                    w-2 h-2 mt-2 rounded-full shrink-0
                                    ${a.action_type === 'LOGIN' ? 'bg-green-500' :
                                                a.action_type === 'SIMULATOR_CALC' ? 'bg-indigo-500' :
                                                    a.action_type === 'MAP_OPEN' ? 'bg-amber-400' : 'bg-slate-300'}
                                `} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <div className="font-bold text-slate-800 text-sm">
                                                    {a.action_type} <span className="text-slate-400 font-normal mx-1">•</span> <span className="text-indigo-600">{a.profiles?.full_name}</span>
                                                </div>
                                                <div className="text-xs text-slate-400 font-medium whitespace-nowrap ml-4">
                                                    {formatDate(a.created_at)}
                                                </div>
                                            </div>
                                            <div className="mt-1 text-sm text-slate-600 break-words font-medium">
                                                {getMetadataPreview(a.metadata, a.action_type)}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-400 font-mono">
                                                {a.curr_path}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
