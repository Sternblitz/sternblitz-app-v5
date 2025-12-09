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
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Settings, Trash2, Edit2, Clock, AlertCircle, CheckCircle, Calendar } from "lucide-react";

// --- Components ---

function SortableColumn({ column, cards, onAddCard, onEditColumn, onCardClick, isEditMode, onDeleteCard }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: column.id,
        data: { type: "Column", column },
        disabled: !isEditMode
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="bg-slate-100 opacity-40 border-2 border-dashed border-slate-300 w-80 h-[600px] rounded-xl flex-shrink-0"
            />
        );
    }

    return (
        <div ref={setNodeRef} style={style} className="w-80 flex-shrink-0 flex flex-col h-full max-h-full">
            {/* Header */}
            <div className={`p-3 rounded-t-xl flex justify-between items-center ${column.color} ${isEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`} {...attributes} {...listeners}>
                <div className="flex items-center gap-2 font-bold text-sm">
                    {column.title}
                    <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                        {cards.length}
                    </span>
                </div>
                {isEditMode && (
                    <button onClick={() => onEditColumn(column)} className="p-1 hover:bg-white/20 rounded">
                        <Settings size={14} />
                    </button>
                )}
            </div>

            {/* Body */}
            <div className="bg-slate-50 border-x border-b border-slate-200 rounded-b-xl p-2 flex-1 overflow-y-auto min-h-[100px]">
                <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                        {cards.map(c => (
                            <SortableCard
                                key={c.id}
                                card={c}
                                onClick={() => onCardClick(c)}
                                onDelete={onDeleteCard}
                            />
                        ))}
                    </div>
                </SortableContext>
                {!isEditMode && (
                    <button
                        onClick={() => onAddCard(column.id)}
                        className="w-full mt-2 py-2 flex items-center justify-center gap-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg text-sm transition-colors border border-transparent hover:border-slate-200 dashed"
                    >
                        <Plus size={14} /> Karte hinzufügen
                    </button>
                )}
            </div>
        </div>
    );
}

function SortableCard({ card, onClick, onDelete }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: card.id,
        data: { type: "Card", card }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="bg-white p-3 rounded-lg shadow-lg border border-blue-500 opacity-80 h-24 rotate-2"
            />
        );
    }

    // Invoice Status Logic
    const getInvoiceStatusColor = () => {
        if (!card.invoice_due_date) return "text-slate-400";
        const due = new Date(card.invoice_due_date);
        const now = new Date();
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

        if (card.invoice_status === 'PAID') return "text-emerald-500";
        if (diffDays < 0) return "text-red-500"; // Overdue
        if (diffDays <= 7) return "text-amber-500"; // Due soon
        return "text-slate-500";
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer active:cursor-grabbing group relative"
        >
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-slate-800 text-sm">{card.title}</h4>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {card.description && (
                <div className="text-xs text-slate-500 mb-2 line-clamp-2">{card.description}</div>
            )}

            <div className="flex items-center gap-3 mt-2 border-t border-slate-50 pt-2">
                {card.invoice_due_date && (
                    <div className={`flex items-center gap-1 text-[10px] font-bold ${getInvoiceStatusColor()}`}>
                        <Clock size={10} />
                        {new Date(card.invoice_due_date).toLocaleDateString("de-DE")}
                    </div>
                )}
                {card.invoice_status === 'PAID' && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        <CheckCircle size={10} /> Bezahlt
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Modals ---

function CardModal({ isOpen, onClose, card, columnId, onSave }) {
    const [formData, setFormData] = useState({
        title: "", description: "", invoice_due_date: "", invoice_status: "PENDING", invoice_amount: 0
    });

    useEffect(() => {
        if (card) {
            setFormData({
                ...card,
                invoice_due_date: card.invoice_due_date ? new Date(card.invoice_due_date).toISOString().split('T')[0] : ""
            });
        } else {
            setFormData({ title: "", description: "", invoice_due_date: "", invoice_status: "PENDING", invoice_amount: 0 });
        }
    }, [card, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ ...formData, column_id: columnId || card?.column_id });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-900">
                        {card ? "Karte bearbeiten" : "Neue Karte"}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Titel / Kunde</label>
                        <input required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Kundenname" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nächste Rechnung</label>
                            <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.invoice_due_date} onChange={e => setFormData({ ...formData, invoice_due_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                            <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.invoice_status} onChange={e => setFormData({ ...formData, invoice_status: e.target.value })}>
                                <option value="PENDING">Offen</option>
                                <option value="SENT">Versendet</option>
                                <option value="PAID">Bezahlt</option>
                                <option value="OVERDUE">Überfällig</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Beschreibung / Notizen</label>
                        <textarea className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                            value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Details..." />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Abbrechen</button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200">Speichern</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ColumnModal({ isOpen, onClose, column, onSave, onDelete }) {
    const [title, setTitle] = useState("");
    const [color, setColor] = useState("bg-slate-100 text-slate-800");

    useEffect(() => {
        if (column) {
            setTitle(column.title);
            setColor(column.color || "bg-slate-100 text-slate-800");
        } else {
            setTitle("");
            setColor("bg-slate-100 text-slate-800");
        }
    }, [column, isOpen]);

    if (!isOpen) return null;

    const colors = [
        { label: "Grau", val: "bg-slate-100 text-slate-800" },
        { label: "Blau", val: "bg-blue-100 text-blue-800" },
        { label: "Grün", val: "bg-green-100 text-green-800" },
        { label: "Gelb", val: "bg-yellow-100 text-yellow-800" },
        { label: "Rot", val: "bg-red-100 text-red-800" },
        { label: "Lila", val: "bg-purple-100 text-purple-800" },
        { label: "Orange", val: "bg-orange-100 text-orange-800" },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-900">{column ? "Spalte bearbeiten" : "Neue Spalte"}</h2>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Titel</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Erstgespräch" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Farbe</label>
                        <div className="flex flex-wrap gap-2">
                            {colors.map(c => (
                                <button
                                    key={c.val}
                                    onClick={() => setColor(c.val)}
                                    className={`w-8 h-8 rounded-full border-2 ${c.val.split(' ')[0]} ${color === c.val ? 'border-slate-900' : 'border-transparent'}`}
                                    title={c.label}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="pt-4 flex justify-between items-center">
                        {column && onDelete ? (
                            <button onClick={() => onDelete(column.id)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={18} /></button>
                        ) : <div></div>}
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Abbrechen</button>
                            <button onClick={() => onSave({ ...column, title, color })} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Speichern</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Main Page ---

export default function KanbanPage() {
    const [columns, setColumns] = useState([]);
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [activeId, setActiveId] = useState(null);

    const [cardModalOpen, setCardModalOpen] = useState(false);
    const [colModalOpen, setColModalOpen] = useState(false);
    const [selectedCard, setSelectedCard] = useState(null);
    const [selectedCol, setSelectedCol] = useState(null);
    const [targetColId, setTargetColId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchData = async () => {
        setLoading(true);
        const { data: cols } = await supabase().from("crm_kanban_columns").select("*").order("order_index");
        const { data: c } = await supabase().from("crm_kanban_cards").select("*").order("created_at", { ascending: false });

        if (cols) setColumns(cols);
        if (c) setCards(c);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    // Handlers
    const openAddCard = (colId = null) => {
        setSelectedCard(null);
        setTargetColId(colId || columns[0]?.id);
        setCardModalOpen(true);
    };

    const openEditCard = (card) => {
        setSelectedCard(card);
        setCardModalOpen(true);
    };

    const openAddCol = () => {
        setSelectedCol(null);
        setColModalOpen(true);
    };

    const openEditCol = (col) => {
        setSelectedCol(col);
        setColModalOpen(true);
    };

    const handleSaveCard = async (cardData) => {
        if (cardData.id) {
            const { error } = await supabase().from("crm_kanban_cards").update(cardData).eq("id", cardData.id);
            if (!error) setCards(prev => prev.map(c => c.id === cardData.id ? cardData : c));
        } else {
            const { data, error } = await supabase().from("crm_kanban_cards").insert([cardData]).select().single();
            if (!error && data) setCards(prev => [data, ...prev]);
        }
        setCardModalOpen(false);
    };

    const handleSaveColumn = async (colData) => {
        if (colData.id) {
            const { error } = await supabase().from("crm_kanban_columns").update({ title: colData.title, color: colData.color }).eq("id", colData.id);
            if (!error) setColumns(prev => prev.map(c => c.id === colData.id ? { ...c, title: colData.title, color: colData.color } : c));
        } else {
            const maxOrder = Math.max(...columns.map(c => c.order_index), -1);
            const newCol = { title: colData.title, color: colData.color, order_index: maxOrder + 1 };
            const { data, error } = await supabase().from("crm_kanban_columns").insert([newCol]).select().single();
            if (!error && data) setColumns(prev => [...prev, data]);
        }
        setColModalOpen(false);
    };

    const handleDeleteColumn = async (id) => {
        if (!confirm("Spalte wirklich löschen? Karten darin werden gelöscht.")) return;
        const { error } = await supabase().from("crm_kanban_columns").delete().eq("id", id);
        if (!error) {
            setColumns(prev => prev.filter(c => c.id !== id));
            setCards(prev => prev.filter(c => c.column_id !== id));
        }
        setColModalOpen(false);
    };

    const handleDeleteCard = async (id) => {
        if (!confirm("Karte wirklich löschen?")) return;
        const { error } = await supabase().from("crm_kanban_cards").delete().eq("id", id);
        if (!error) {
            setCards(prev => prev.filter(c => c.id !== id));
        }
    };

    // Drag Handlers
    const handleDragStart = (event) => setActiveId(event.active.id);

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over) return;
        if (active.id === over.id) return;

        const isActiveCard = active.data.current?.type === "Card";
        const isOverCard = over.data.current?.type === "Card";
        const isOverColumn = over.data.current?.type === "Column";

        if (isActiveCard && isOverColumn) {
            // Moving over a column
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;

        const activeType = active.data.current?.type;

        if (activeType === "Column" && isEditMode) {
            if (active.id !== over.id) {
                const oldIndex = columns.findIndex(c => c.id === active.id);
                const newIndex = columns.findIndex(c => c.id === over.id);
                const newCols = arrayMove(columns, oldIndex, newIndex);
                setColumns(newCols);
                const updates = newCols.map((col, idx) => ({ id: col.id, order_index: idx }));
                for (const u of updates) await supabase().from("crm_kanban_columns").update({ order_index: u.order_index }).eq("id", u.id);
            }
            return;
        }

        if (activeType === "Card") {
            const activeCard = cards.find(c => c.id === active.id);
            const overCard = cards.find(c => c.id === over.id);
            const overCol = columns.find(c => c.id === over.id);

            let newColumnId = null;
            if (overCard) newColumnId = overCard.column_id;
            else if (overCol) newColumnId = overCol.id;

            if (newColumnId && activeCard.column_id !== newColumnId) {
                setCards(prev => prev.map(c => c.id === active.id ? { ...c, column_id: newColumnId } : c));
                await supabase().from("crm_kanban_cards").update({ column_id: newColumnId }).eq("id", active.id);
            }
        }
    };

    const columnsId = useMemo(() => columns.map(c => c.id), [columns]);

    // To-Do Logic (Upcoming Invoices)
    const upcomingInvoices = useMemo(() => {
        const now = new Date();
        return cards.filter(c => {
            if (!c.invoice_due_date || c.invoice_status === 'PAID') return false;
            const due = new Date(c.invoice_due_date);
            const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
            return diffDays <= 7; // Due within 7 days or overdue
        }).sort((a, b) => new Date(a.invoice_due_date) - new Date(b.invoice_due_date));
    }, [cards]);

    if (loading) return <div className="p-10 text-center text-slate-400">Lade Board...</div>;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-1">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Kanban Board</h1>
                    <p className="text-slate-500">Kunden & Rechnungen managen</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${isEditMode ? 'bg-amber-100 text-amber-800' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Settings size={16} />
                        {isEditMode ? "Fertig" : "Spalten bearbeiten"}
                    </button>
                    <button onClick={() => openAddCard()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition flex items-center gap-2">
                        <Plus size={18} />
                        Karte
                    </button>
                </div>
            </div>

            {/* To-Do Bar (Upcoming Invoices) */}
            {upcomingInvoices.length > 0 && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4 overflow-x-auto">
                    <div className="flex items-center gap-2 font-bold text-amber-800 whitespace-nowrap">
                        <AlertCircle size={20} />
                        Fällige Rechnungen:
                    </div>
                    {upcomingInvoices.map(c => (
                        <div key={c.id} onClick={() => openEditCard(c)} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-amber-100 shadow-sm cursor-pointer hover:shadow-md transition-all whitespace-nowrap">
                            <span className="font-bold text-slate-800 text-sm">{c.title}</span>
                            <span className="text-xs text-amber-600 font-mono bg-amber-100 px-1.5 rounded">
                                {new Date(c.invoice_due_date).toLocaleDateString("de-DE")}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Board */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
                    <div className="flex h-full gap-6 min-w-max px-1">
                        <SortableContext items={columnsId} strategy={horizontalListSortingStrategy}>
                            {columns.map(col => (
                                <SortableColumn
                                    key={col.id}
                                    column={col}
                                    cards={cards.filter(c => c.column_id === col.id)}
                                    isEditMode={isEditMode}
                                    onAddCard={() => openAddCard(col.id)}
                                    onEditColumn={() => openEditCol(col)}
                                    onCardClick={(c) => openEditCard(c)}
                                    onDeleteCard={handleDeleteCard}
                                />
                            ))}
                        </SortableContext>

                        {isEditMode && (
                            <button
                                onClick={openAddCol}
                                className="w-80 h-16 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition bg-slate-50/50"
                            >
                                <Plus size={20} /> Spalte hinzufügen
                            </button>
                        )}
                    </div>
                </div>

                <DragOverlay>
                    {activeId ? (
                        columns.find(c => c.id === activeId) ? (
                            <div className="bg-white p-3 rounded-t-xl border border-slate-300 shadow-xl w-80 opacity-90">
                                <div className="font-bold">{columns.find(c => c.id === activeId).title}</div>
                            </div>
                        ) : (
                            <div className="bg-white p-3 rounded-lg shadow-xl border border-blue-500 w-72">
                                <div className="font-bold">{cards.find(c => c.id === activeId)?.title}</div>
                            </div>
                        )
                    ) : null}
                </DragOverlay>
            </DndContext>

            <CardModal
                isOpen={cardModalOpen}
                onClose={() => setCardModalOpen(false)}
                card={selectedCard}
                columnId={targetColId}
                onSave={handleSaveCard}
            />

            <ColumnModal
                isOpen={colModalOpen}
                onClose={() => setColModalOpen(false)}
                column={selectedCol}
                onSave={handleSaveColumn}
                onDelete={handleDeleteColumn}
            />
        </div>
    );
}
