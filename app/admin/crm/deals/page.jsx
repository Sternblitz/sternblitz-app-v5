"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Search,
    RefreshCw,
    CheckCircle,
    Clock,
    AlertCircle,
    XCircle,
    CreditCard,
    User,
    Building2,
    Calendar,
    DollarSign,
    MoreHorizontal,
    ArrowRight,
    FileText,
    Plus,
    X
} from "lucide-react";

// --- Constants ---
const COLUMNS = {
    INBOX: { title: "📥 EINGANG", color: "border-slate-400" },
    PROCESSING: { title: "⚖️ IN ARBEIT", color: "border-blue-500" },
    SUCCESS_OPEN: { title: "✅ ERFOLG (Offen)", color: "border-emerald-500" },
    DONE: { title: "💰 DONE (Prov. fällig)", color: "border-purple-500" }
};

const COLUMN_IDS = ["INBOX", "PROCESSING", "SUCCESS_OPEN", "DONE"];

// --- Helper Components ---

function KanbanCard({ deal, isOverlay, onPayCommission, onDealClick }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: deal.id, data: { deal } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    // Metrics Logic
    const toNumber = (value) => {
        const num = typeof value === "string" ? Number(value) : value;
        return Number.isFinite(num) ? num : null;
    };
    const countsObj = deal?.counts && typeof deal.counts === "object" ? deal.counts : null;
    const startBad1 = toNumber(deal?.start_bad_1);
    const startBad2 = toNumber(deal?.start_bad_2);
    const startBad3 = toNumber(deal?.start_bad_3);
    const startValues = [startBad1, startBad2, startBad3].filter((value) => Number.isFinite(value));
    let startSum = startValues.length ? startValues.reduce((sum, value) => sum + value, 0) : null;
    if (!Number.isFinite(startSum) && countsObj) {
        const altStart = toNumber(countsObj.c123);
        if (Number.isFinite(altStart)) startSum = altStart;
    }
    const liveBad1 = toNumber(deal?.live_bad_1);
    const liveBad2 = toNumber(deal?.live_bad_2);
    const liveBad3 = toNumber(deal?.live_bad_3);
    const liveValues = [liveBad1, liveBad2, liveBad3].filter((value) => Number.isFinite(value));
    let liveSum = liveValues.length ? liveValues.reduce((sum, value) => sum + value, 0) : null;
    if (!Number.isFinite(liveSum)) {
        if (countsObj) {
            const alt = toNumber(countsObj.c123);
            if (Number.isFinite(alt)) liveSum = alt;
        } else if (Number.isFinite(startSum)) {
            liveSum = startSum;
        }
    }
    let progress = null;
    if (Number.isFinite(startSum) && startSum > 0 && Number.isFinite(liveSum)) {
        progress = Math.max(0, Math.min(100, ((startSum - liveSum) / startSum) * 100));
    } else if (Number.isFinite(startSum) && startSum === 0) {
        progress = Number.isFinite(liveSum) && liveSum <= 0 ? 100 : 0;
    }

    const contactName = [deal.first_name, deal.last_name].filter(Boolean).join(" ");
    const dateStr = new Date(deal.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onDealClick && onDealClick(deal)}
            className={`
        bg-white p-4 rounded-xl border-l-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group
        ${deal.admin_stage === 'DONE' ? 'border-purple-500' :
                    deal.admin_stage === 'SUCCESS_OPEN' ? 'border-emerald-500' :
                        deal.admin_stage === 'PROCESSING' ? 'border-blue-500' : 'border-slate-300'}
        ${isOverlay ? "shadow-xl rotate-2 scale-105 ring-2 ring-indigo-500/20" : ""}
      `}
        >
            {/* Header: Company & Date & Payment Badge */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <Building2 size={16} />
                    </div>
                    <div>
                        <div className="font-bold text-slate-900 text-sm leading-tight line-clamp-1">{deal.google_profile || deal.company || "Unbekannt"}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar size={10} /> {dateStr}
                        </div>
                    </div>
                </div>

                {/* Payment & Commission Badges */}
                <div className="flex flex-col items-end gap-1">
                    {deal.stripe_payment_method_id ? (
                        <div className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-100 flex items-center gap-1">
                            <CreditCard size={10} />
                            <span>Zahlung OK</span>
                        </div>
                    ) : (
                        <div className="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-100 flex items-center gap-1">
                            <CreditCard size={10} />
                            <span>Fehlt</span>
                        </div>
                    )}
                    {deal.commission_status === 'PAID' && (
                        <div className="text-emerald-600 bg-emerald-50 p-0.5 rounded-md" title="Provision bezahlt">
                            <CheckCircle size={12} />
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Bar & Values */}
            <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                    <span className="text-slate-400">Lösch-Fortschritt</span>
                    <div className="flex items-center gap-2">
                        {/* Before -> After Display */}
                        <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                            <span className="text-rose-500">{startSum ?? "-"}</span>
                            <ArrowRight size={8} className="text-slate-300" />
                            <span className="text-emerald-600">{liveSum ?? "-"}</span>
                        </div>
                        {/* Percentage */}
                        <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{Number.isFinite(progress) ? Math.round(progress) : 0}%</span>
                    </div>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Number.isFinite(progress) ? progress : 0}%` }}
                    />
                </div>
            </div>

            {/* Footer: Sales Rep & Payment Status */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                        {deal.profiles?.full_name?.[0] || "?"}
                    </div>
                    <span className="text-xs text-slate-600 font-medium truncate max-w-[80px]">{deal.profiles?.full_name || "Unbekannt"}</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Commission Action */}
                    {deal.admin_stage === 'DONE' && deal.commission_status !== 'PAID' && (
                        <button
                            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
                            onClick={(e) => { e.stopPropagation(); onPayCommission(deal.id); }}
                            className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded shadow-sm hover:bg-indigo-700 transition-colors"
                        >
                            Pay 100€
                        </button>
                    )}

                    <div className="flex gap-1">
                        {deal.stripe_payment_method_id ? (
                            <CreditCard size={14} className="text-emerald-500" title="Zahlungsmethode hinterlegt" />
                        ) : (
                            <CreditCard size={14} className="text-slate-300" title="Keine Zahlungsmethode" />
                        )}
                        {deal.invoice_sent ? (
                            <FileText size={14} className="text-blue-500" title="Rechnung versendet" />
                        ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-slate-300" title="Rechnung offen" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function KanbanColumn({ id, title, color, deals, count, onPayCommission, onDealClick }) {
    const { setNodeRef } = useSortable({ id });

    return (
        <div ref={setNodeRef} className="flex flex-col h-full min-w-[300px] w-[300px] bg-slate-50/50 rounded-2xl border border-slate-200/60">
            <div className={`p-4 border-b-4 ${color} flex justify-between items-center sticky top-0 bg-slate-50/95 backdrop-blur-sm rounded-t-2xl z-10`}>
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">{title}</h3>
                    <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-slate-400 border border-slate-100 shadow-sm">{count}</span>
                </div>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-3">
                <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
                    {deals.map((deal) => (
                        <KanbanCard key={deal.id} deal={deal} onPayCommission={onPayCommission} onDealClick={onDealClick} />
                    ))}
                </SortableContext>
                {deals.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-xs font-medium">
                        Leer
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Drawer Component ---
function DealDetailsDrawer({ deal, onClose, onUpdate }) {
    const [notes, setNotes] = useState(deal.custom_notes || "");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        const { error } = await supabase()
            .from("orders")
            .update({ custom_notes: notes })
            .eq("id", deal.id);

        if (error) {
            alert("Fehler beim Speichern: " + error.message);
        } else {
            onUpdate({ ...deal, custom_notes: notes });
            onClose();
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer */}
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col animate-in slide-in-from-right duration-300 overflow-y-auto">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 leading-tight">{deal.google_profile || deal.company || "Unbekannt"}</h2>
                        <p className="text-slate-500 text-sm flex items-center gap-1 mt-1">
                            <User size={14} />
                            Vertriebler: <span className="font-bold text-indigo-600">{deal.profiles?.full_name || "Unbekannt"}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-6 pb-6">
                    {/* Status Section */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Status & Phase</h3>
                        <div className="flex flex-wrap gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${deal.admin_stage === 'DONE' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {COLUMNS[deal.admin_stage]?.title || deal.admin_stage}
                            </span>
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white border border-slate-200 text-slate-500">
                                {deal.status}
                            </span>
                        </div>
                    </div>

                    {/* Stammdaten (Contact Info) */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                            <User size={16} className="text-slate-400" />
                            Stammdaten & Kontakt
                        </h3>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-sm">
                            <div className="grid grid-cols-3 gap-2">
                                <span className="text-slate-500">Firma</span>
                                <span className="col-span-2 font-medium text-slate-900">{deal.company}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <span className="text-slate-500">Ansprechpartner</span>
                                <span className="col-span-2 font-medium text-slate-900">{deal.first_name} {deal.last_name}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <span className="text-slate-500">E-Mail</span>
                                <span className="col-span-2 font-medium text-slate-900 break-all">{deal.email}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <span className="text-slate-500">Telefon</span>
                                <span className="col-span-2 font-medium text-slate-900">{deal.phone || "-"}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <span className="text-slate-500">Adresse</span>
                                <span className="col-span-2 font-medium text-slate-900">{deal.review_address || "-"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Rechnungsdaten (Invoice Info) */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                            <CreditCard size={16} className="text-slate-400" />
                            Rechnung & Zahlung
                        </h3>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Rechnung versendet?</span>
                                {deal.invoice_sent ? (
                                    <span className="flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded text-xs">
                                        <CheckCircle size={12} /> Ja
                                    </span>
                                ) : (
                                    <span className="text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">Nein</span>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Zahlungsmethode</span>
                                {deal.stripe_payment_method_id ? (
                                    <span className="text-indigo-600 font-medium">Hinterlegt (Stripe)</span>
                                ) : (
                                    <span className="text-amber-600 font-medium">Ausstehend</span>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500">Provision (100€)</span>
                                {deal.commission_status === 'PAID' ? (
                                    <span className="text-emerald-600 font-bold">Bezahlt</span>
                                ) : (
                                    <span className="text-slate-400 font-medium">Offen</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Notes Section */}
                    <div>
                        <label className="block text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                            <FileText size={16} className="text-slate-400" />
                            Notizen
                        </label>
                        <textarea
                            className="w-full h-32 p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 leading-relaxed resize-none shadow-sm text-sm"
                            placeholder="Hier Notizen eingeben..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    {/* Meta Info */}
                    <div className="text-xs text-slate-400 text-center pt-4">
                        Erstellt am {new Date(deal.created_at).toLocaleString("de-DE")}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-slate-100 flex gap-3 mt-auto">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        Schließen
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-70"
                    >
                        {saving ? "Speichert..." : "Speichern"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Main Page ---

export default function KanbanPage() {
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDeal, setSelectedDeal] = useState(null); // For Drawer
    const [newDeal, setNewDeal] = useState({ company: "", first_name: "", last_name: "", email: "" });
    const [creating, setCreating] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // ... (fetchDeals remains same) ...
    const fetchDeals = async () => {
        setLoading(true);

        // 1. Fetch Orders
        const { data: ordersData, error: ordersError } = await supabase()
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false });

        if (ordersError) {
            console.error("Error fetching orders:", ordersError);
            setLoading(false);
            return;
        }

        // 2. Fetch Profiles (to map created_by -> full_name)
        const { data: profilesData, error: profilesError } = await supabase()
            .from("profiles")
            .select("user_id, full_name");

        if (profilesError) {
            console.error("Error fetching profiles:", profilesError);
        }

        // 3. Join Data
        const profilesMap = {};
        if (profilesData) {
            profilesData.forEach(p => {
                profilesMap[p.user_id] = p;
            });
        }

        const joinedDeals = ordersData.map(order => ({
            ...order,
            profiles: profilesMap[order.created_by] || { full_name: "Unbekannt" }
        }));

        setDeals(joinedDeals);
        setLoading(false);
    };

    useEffect(() => {
        fetchDeals();
        const channel = supabase()
            .channel('kanban-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    // We need to re-fetch to get profile info properly, or just add raw
                    fetchDeals();
                } else if (payload.eventType === 'UPDATE') {
                    setDeals(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d));
                }
            })
            .subscribe();
        return () => { supabase().removeChannel(channel); };
    }, []);

    // ... (getColumnId, columns, handleDragStart/Over/End remain same) ...
    const getColumnId = (deal) => {
        if (!deal.admin_stage) return "INBOX";
        return deal.admin_stage;
    };

    const columns = useMemo(() => {
        const cols = { INBOX: [], PROCESSING: [], SUCCESS_OPEN: [], DONE: [] };
        deals.filter(d => {
            const term = searchTerm.toLowerCase();
            return !term || (d.company || "").toLowerCase().includes(term) || (d.profiles?.full_name || "").toLowerCase().includes(term);
        }).forEach(deal => {
            const colId = getColumnId(deal);
            if (cols[colId]) cols[colId].push(deal);
            else cols.INBOX.push(deal);
        });
        return cols;
    }, [deals, searchTerm]);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragOver = (event) => {
        // Optional: Add visual feedback
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const dealId = active.id;
        const deal = deals.find(d => d.id === dealId);
        if (!deal) return;

        let targetContainer = over.id;
        if (COLUMN_IDS.includes(over.id)) {
            targetContainer = over.id;
        } else {
            const overDeal = deals.find(d => d.id === over.id);
            if (overDeal) targetContainer = getColumnId(overDeal);
        }

        const currentContainer = getColumnId(deal);
        if (currentContainer === targetContainer) return;

        let updates = { admin_stage: targetContainer };

        // Auto-update Payment Status based on Column
        if (targetContainer === 'DONE') {
            updates.payment_status = 'paid';
        } else if (currentContainer === 'DONE' && targetContainer !== 'DONE') {
            // If moving OUT of DONE, revert payment status (unless we want to keep it paid?)
            // Let's revert to 'open' to be safe, assuming 'DONE' implies 'Paid'
            updates.payment_status = 'open';
            updates.commission_status = 'OPEN'; // Also revert commission if moving back
        }

        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updates } : d));

        const { error } = await supabase().from("orders").update(updates).eq("id", dealId);
        if (error) {
            console.error("Error moving deal:", error);
            fetchDeals(); // Revert on error
        }
    };

    const handlePayCommission = async (dealId) => {
        // Optimistic Update
        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, commission_status: 'PAID' } : d));

        const { error } = await supabase().from("orders").update({ commission_status: 'PAID' }).eq("id", dealId);

        if (error) {
            console.error("Error paying commission:", error);
            // Revert on error
            setDeals(prev => prev.map(d => d.id === dealId ? { ...d, commission_status: 'OPEN' } : d));
            // Ideally show a toast here, but for now console error is better than alert
        }
    };

    const handleCreateDeal = async () => {
        if (!newDeal.company) return alert("Firmenname fehlt");
        setCreating(true);

        const { data: { session } } = await supabase().auth.getSession();
        if (!session) {
            alert("Nicht eingeloggt");
            setCreating(false);
            return;
        }

        const { data: profile } = await supabase()
            .from("profiles")
            .select("org_id")
            .eq("user_id", session.user.id)
            .single();

        if (!profile?.org_id) {
            alert("Fehler: Kein Organisations-Profil gefunden.");
            setCreating(false);
            return;
        }

        const { data, error } = await supabase().from("orders").insert({
            company: newDeal.company,
            first_name: newDeal.first_name,
            last_name: newDeal.last_name,
            email: newDeal.email,
            status: 'NEW',
            admin_stage: 'INBOX',
            created_by: session.user.id,
            org_id: profile.org_id,
            google_profile: newDeal.company
        }).select().single();

        if (error) {
            alert("Fehler beim Erstellen: " + error.message);
        } else {
            const dealWithProfile = {
                ...data,
                profiles: { full_name: "Du (Admin)" }
            };
            setDeals(prev => [dealWithProfile, ...prev]);
            setShowAddModal(false);
            setNewDeal({ company: "", first_name: "", last_name: "", email: "" });
        }
        setCreating(false);
    };

    const activeDeal = activeId ? deals.find(d => d.id === activeId) : null;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            <header className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Deals Board</h1>
                    <p className="text-slate-500 text-sm">Drag & Drop Management • Admin Only View</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Suchen..."
                            className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                    >
                        <Plus size={18} />
                        Deal
                    </button>
                </div>
            </header>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex-1 flex gap-4 overflow-x-auto pb-4 px-2">
                    {COLUMN_IDS.map(colId => (
                        <KanbanColumn
                            key={colId}
                            id={colId}
                            title={COLUMNS[colId].title}
                            color={COLUMNS[colId].color}
                            deals={columns[colId]}
                            count={columns[colId].length}
                            onPayCommission={handlePayCommission}
                            onDealClick={setSelectedDeal}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {activeDeal ? <KanbanCard deal={activeDeal} isOverlay /> : null}
                </DragOverlay>
            </DndContext>

            {/* Add Deal Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-900">Neuen Deal anlegen</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Firmenname *</label>
                                <input
                                    type="text"
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                    placeholder="z.B. Autohaus Müller"
                                    value={newDeal.company}
                                    onChange={(e) => setNewDeal({ ...newDeal, company: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vorname</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Max"
                                        value={newDeal.first_name}
                                        onChange={(e) => setNewDeal({ ...newDeal, first_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nachname</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Mustermann"
                                        value={newDeal.last_name}
                                        onChange={(e) => setNewDeal({ ...newDeal, last_name: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-Mail</label>
                                <input
                                    type="email"
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="kontakt@firma.de"
                                    value={newDeal.email}
                                    onChange={(e) => setNewDeal({ ...newDeal, email: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    Abbrechen
                                </button>
                                <button
                                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                    onClick={handleCreateDeal}
                                    disabled={creating}
                                >
                                    {creating ? "Speichert..." : "Deal anlegen"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Deal Details Drawer */}
            {selectedDeal && (
                <DealDetailsDrawer
                    deal={selectedDeal}
                    onClose={() => setSelectedDeal(null)}
                    onUpdate={(updatedDeal) => {
                        setDeals(prev => prev.map(d => d.id === updatedDeal.id ? updatedDeal : d));
                    }}
                />
            )}
        </div>
    );
}
