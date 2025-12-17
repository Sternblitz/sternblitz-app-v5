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
    X,
    Rocket
} from "lucide-react";
import DeletionModal from "@/components/admin/DeletionModal";

// --- Constants ---
const COLUMNS = {
    INBOX: { title: "📥 EINGANG", color: "border-slate-400" },
    PROCESSING: { title: "⚖️ IN ARBEIT", color: "border-blue-500" },
    SUCCESS_OPEN: { title: "✅ ERFOLG (Offen)", color: "border-emerald-500" },
    DONE: { title: "💰 DONE (Prov. fällig)", color: "border-purple-500" }
};

const STATUS_LABELS = {
    NEW: "Neu",
    PROCESSING: "Löschung in Bearbeitung ⏳",
    SUCCESS: "Erfolgreich gelöscht, warte auf Zahlung 💸",
    WAITING_PAYMENT: "Erfolgreich gelöscht, warte auf Zahlung 💸",
    PAID_DELETED: "Bezahlt, warte auf Provision 🤑",
    COMMISSION_PAID: "Provision ausbezahlt 💰"
};



const COLUMN_IDS = ["INBOX", "PROCESSING", "SUCCESS_OPEN", "DONE"];

// --- Helper Components ---

function KanbanCard({ deal, isOverlay, onPayCommission, onDealClick, onStartDeletion }) {
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
                    {/* Deletion Trigger */}
                    {deal.google_place_id && !deal.deletion_started_at && (
                        <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onStartDeletion(deal); }}
                            className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors border border-blue-100"
                            title="Löschung starten"
                        >
                            <Rocket size={12} />
                        </button>
                    )}
                    {deal.deletion_started_at && (
                        <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100" title={`Gestartet: ${new Date(deal.deletion_started_at).toLocaleDateString()}`}>
                            🚀 Gestartet
                        </div>
                    )}


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

function KanbanColumn({ id, title, color, deals, count, onPayCommission, onDealClick, onStartDeletion }) {
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
                        <KanbanCard
                            key={deal.id}
                            deal={deal}
                            onPayCommission={onPayCommission}
                            onDealClick={onDealClick}
                            onStartDeletion={onStartDeletion}
                        />
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
function DealDetailsDrawer({ deal, onClose, onUpdate, onStartDeletion }) {
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
            // onClose(); // Don't close, just update
        }
        setSaving(false);
    };



    // Removed handleSubmitDeletion

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
                    {/* Deletion Section */}
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <h3 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <Rocket size={14} />
                            Löschung & Place ID
                        </h3>
                        <div className="bg-white/60 rounded-lg p-3 border border-blue-100/50 mb-3">
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Google Place ID</div>
                            <div className="font-mono text-sm font-medium text-slate-700 select-all">
                                {deal.google_place_id || "Keine ID vorhanden"}
                            </div>
                        </div>

                        {deal.deletion_started_at ? (
                            <div className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-100/50 p-3 rounded-lg">
                                <Rocket size={16} />
                                <span>Gestartet am {new Date(deal.deletion_started_at).toLocaleDateString()}</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => onStartDeletion(deal)}
                                disabled={!deal.google_place_id}
                                className="w-full py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Rocket size={16} />
                                Löschung starten
                            </button>
                        )}
                    </div>

                    {/* Status Section */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Status & Phase</h3>
                        <div className="flex flex-wrap gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${deal.admin_stage === 'DONE' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {COLUMNS[deal.admin_stage]?.title || deal.admin_stage}
                            </span>
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white border border-slate-200 text-slate-500">
                                {STATUS_LABELS[deal.status] || deal.status}
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

            {/* Removed DeletionModal from here */}
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

    const [isManager, setIsManager] = useState(false);

    useEffect(() => {
        const checkRole = async () => {
            const { data: { user } } = await supabase().auth.getUser();
            if (user) {
                const { data: profile } = await supabase().from("profiles").select("role").eq("user_id", user.id).single();
                if (profile?.role === "MANAGER") setIsManager(true);
            }
        };
        checkRole();
    }, []);

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
        if (isManager) return; // Disable drag for Manager
        setActiveId(event.active.id);
    };

    const handleDragOver = (event) => {
        // Optional: Add visual feedback
    };

    const handleDragEnd = async (event) => {
        if (isManager) return; // Disable drag for Manager
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

        // Auto-update Payment Status & Order Status based on Column
        if (targetContainer === 'DONE') {
            updates.payment_status = 'paid';
            updates.status = 'PAID_DELETED';
        } else if (targetContainer === 'SUCCESS_OPEN') {
            updates.status = 'WAITING_PAYMENT';
        } else if (targetContainer === 'PROCESSING') {
            updates.status = 'PROCESSING';
        } else if (targetContainer === 'INBOX') {
            updates.status = 'NEW';
        }

        if (currentContainer === 'DONE' && targetContainer !== 'DONE') {
            // If moving OUT of DONE, revert payment status
            updates.payment_status = 'open';
            updates.commission_status = 'OPEN';
        }

        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...updates } : d));

        const { error } = await supabase().from("orders").update(updates).eq("id", dealId);
        if (error) {
            console.error("Error moving deal:", error);
            fetchDeals(); // Revert on error
        }
    };

    const handlePayCommission = async (dealId) => {
        if (isManager) return; // Disable for Manager
        // Optimistic Update
        setDeals(prev => prev.map(d => d.id === dealId ? { ...d, commission_status: 'PAID', status: 'COMMISSION_PAID' } : d));

        const { error } = await supabase().from("orders").update({ commission_status: 'PAID', status: 'COMMISSION_PAID' }).eq("id", dealId);

        if (error) {
            console.error("Error paying commission:", error);
            // Revert on error
            setDeals(prev => prev.map(d => d.id === dealId ? { ...d, commission_status: 'OPEN', status: 'PAID_DELETED' } : d));
            // Ideally show a toast here, but for now console error is better than alert
        }
    };

    const handleCreateDeal = async () => {
        if (isManager) return; // Disable for Manager
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

        // 1. Create Deal
        const { data, error } = await supabase()
            .from("orders")
            .insert([{
                company: newDeal.company,
                status: "LEAD",
                admin_stage: "LEAD",
                org_id: profile.org_id,
                created_by: session.user.id,
                source_account_id: session.user.id,
                google_profile: newDeal.company, // Fallback
                total_cents: 0, // Default
            }])
            .select()
            .single();

        if (error) {
            alert("Fehler beim Erstellen: " + error.message);
            setCreating(false);
        } else {
            setShowAddModal(false);
            setNewDeal({
                company: "",
                first_name: "",
                last_name: "",
                email: "",
                phone: ""
            });
            setCreating(false);
            fetchDeals(); // Refresh
        }
    };

    const [showDeletionModal, setShowDeletionModal] = useState(false);
    const [deletionDeal, setDeletionDeal] = useState(null);

    const handleOpenDeletion = (deal) => {
        setDeletionDeal(deal);
        setShowDeletionModal(true);
    };

    const handleConfirmDeletion = async (ratingRange) => {
        if (!deletionDeal) return;

        try {
            // Calculate extra data
            const counts = {
                stars_1: Number(deletionDeal.start_bad_1) || 0,
                stars_2: Number(deletionDeal.start_bad_2) || 0,
                stars_3: Number(deletionDeal.start_bad_3) || 0,
            };
            const mapsLink = `https://www.google.com/maps/place/?q=place_id:${deletionDeal.google_place_id}`;

            const res = await fetch("/api/partner/deletion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: deletionDeal.id,
                    placeId: deletionDeal.google_place_id,
                    companyName: deletionDeal.google_profile || deletionDeal.company,
                    ratingRange,
                    reviewCounts: counts,
                    googleMapsLink: mapsLink
                })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Fehler beim Starten");

            // Update local state to show status immediately
            setDeals(prev => prev.map(d =>
                d.id === deletionDeal.id
                    ? { ...d, deletion_started_at: new Date().toISOString() }
                    : d
            ));

            alert("Löschung erfolgreich gestartet! 🚀");
            setShowDeletionModal(false);
            setDeletionDeal(null);
        } catch (err) {
            alert("Fehler: " + err.message);
        }
    };

    const [refreshingAll, setRefreshingAll] = useState(false);
    const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });

    const handleRefreshAll = async () => {
        if (refreshingAll) return;

        // Filter deals: Only INBOX or PROCESSING
        const dealsToRefresh = deals.filter(d => {
            const stage = d.admin_stage || 'INBOX';
            return stage === 'INBOX' || stage === 'PROCESSING';
        });

        if (dealsToRefresh.length === 0) {
            alert("Keine Deals in 'Eingang' oder 'In Arbeit' gefunden.");
            return;
        }

        if (!confirm(`${dealsToRefresh.length} Deals aktualisieren? (Nur Eingang & In Arbeit)`)) return;

        setRefreshingAll(true);
        const total = dealsToRefresh.length;
        setRefreshProgress({ current: 0, total });

        let successCount = 0;

        for (let i = 0; i < total; i++) {
            const deal = dealsToRefresh[i];
            setRefreshProgress({ current: i + 1, total });
            try {
                const res = await fetch(`/api/orders/${deal.id}/refresh`, { method: "POST" });
                if (res.ok) {
                    const json = await res.json();
                    if (json?.row) {
                        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, ...json.row } : d));
                    }
                    successCount++;
                }
            } catch (e) {
                console.error(`Failed to refresh deal ${deal.id}`, e);
            }
        }

        setRefreshingAll(false);
        alert(`Erfolgreich aktualisiert! (${successCount}/${total} Deals)`);
    };


    const activeDeal = activeId ? deals.find(d => d.id === activeId) : null;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            <header className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Deals Board</h1>
                    <p className="text-slate-500 text-sm">Drag & Drop Management • {isManager ? "Read Only" : "Admin Only View"}</p>
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
                        onClick={handleRefreshAll}
                        disabled={refreshingAll}
                        className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors shadow-sm ${refreshingAll ? "opacity-70 cursor-not-allowed" : ""}`}
                    >
                        <RefreshCw size={18} className={refreshingAll ? "animate-spin" : ""} />
                        {refreshingAll ? `${refreshProgress.current}/${refreshProgress.total}` : "Alle aktualisieren"}
                    </button>

                    {!isManager && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                        >
                            <Plus size={18} />
                            Deal
                        </button>
                    )}
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
                            onPayCommission={isManager ? undefined : handlePayCommission}
                            onDealClick={setSelectedDeal}
                            onStartDeletion={handleOpenDeletion}
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
                    onStartDeletion={handleOpenDeletion}
                />
            )}
            {/* Deletion Modal */}
            <DeletionModal
                isOpen={showDeletionModal}
                onClose={() => { setShowDeletionModal(false); setDeletionDeal(null); }}
                onConfirm={handleConfirmDeletion}
                placeId={deletionDeal?.google_place_id}
                companyName={deletionDeal?.company}
            />
        </div>
    );
}
