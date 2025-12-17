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
    defaultDropAnimationSideEffects,
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
import { Plus, MoreHorizontal, Settings, Trash2, Edit2, Phone, MapPin, User, Search, Bookmark } from "lucide-react";

// --- Components ---

function SortableColumn({ column, candidates, onAddCandidate, onEditColumn, onCandidateClick, isEditMode, onDeleteCandidate, onToggleMarkCandidate }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: column.id,
        data: { type: "Column", column },
        disabled: !isEditMode // Only draggable in edit mode
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
                        {candidates.length}
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
                <SortableContext items={candidates.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                        {candidates.map(c => (
                            <SortableCandidate
                                key={c.id}
                                candidate={c}
                                onClick={() => onCandidateClick(c)}
                                onDelete={onDeleteCandidate}
                                onToggleMark={onToggleMarkCandidate}
                            />
                        ))}
                    </div>
                </SortableContext>
                {!isEditMode && (
                    <button
                        onClick={() => onAddCandidate(column.id)}
                        className="w-full mt-2 py-2 flex items-center justify-center gap-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg text-sm transition-colors border border-transparent hover:border-slate-200 dashed"
                    >
                        <Plus size={14} /> Hinzufügen
                    </button>
                )}
            </div>
        </div>
    );
}

function SortableCandidate({ candidate, onClick, onDelete, onToggleMark }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: candidate.id,
        data: { type: "Candidate", candidate }
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className={`bg-white p-3 rounded-lg shadow-sm border transition-all cursor-pointer active:cursor-grabbing group relative ${candidate.is_marked ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}
        >
            {/* Actions (visible on hover) */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleMark(candidate); }}
                    className={`p-1 rounded hover:bg-slate-100 ${candidate.is_marked ? 'text-blue-600' : 'text-slate-400'}`}
                    title="Markieren"
                >
                    <Bookmark size={14} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(candidate.id); }}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                    title="Löschen"
                >
                    <Trash2 size={14} />
                </button>
            </div>
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-slate-800 text-sm">{candidate.name}</h4>
                <Edit2 size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div className="space-y-1">
                {candidate.city && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin size={10} /> {candidate.city}
                    </div>
                )}
                {candidate.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Phone size={10} /> {candidate.phone}
                    </div>
                )}
            </div>

            {candidate.source && (
                <div className="mt-2 text-[10px] text-slate-400 bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-100">
                    {candidate.source}
                </div>
            )}
        </div>
    );
}

// --- Modals ---

function CandidateModal({ isOpen, onClose, candidate, columnId, onSave }) {
    const [formData, setFormData] = useState({
        name: "", phone: "", email: "", city: "", source: "", notes: "", audio_url: ""
    });

    useEffect(() => {
        if (candidate) {
            setFormData(candidate);
        } else {
            setFormData({ name: "", phone: "", email: "", city: "", source: "", notes: "", audio_url: "" });
        }
    }, [candidate, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ ...formData, column_id: columnId || candidate?.column_id });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-900">
                        {candidate ? "Kandidat bearbeiten" : "Neuer Kandidat"}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                            <input required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Max Mustermann" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stadt / Gebiet</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="Berlin" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefon</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="0176..." />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="max@example.com" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Herkunft (Source)</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })}>
                            <option value="">-- Wählen --</option>
                            <option value="Instagram">Instagram</option>
                            <option value="LinkedIn">LinkedIn</option>
                            <option value="Empfehlung">Empfehlung</option>
                            <option value="Cold Call">Cold Call</option>
                            <option value="Bewerbung">Bewerbung</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notizen</label>
                        <textarea className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                            value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Gesprächsnotizen..." />
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

export default function RecruitingPage() {
    const [columns, setColumns] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false); // Edit Columns Mode
    const [activeId, setActiveId] = useState(null); // Dragging ID

    const [candModalOpen, setCandModalOpen] = useState(false);
    const [colModalOpen, setColModalOpen] = useState(false);
    const [selectedCand, setSelectedCand] = useState(null);
    const [selectedCol, setSelectedCol] = useState(null);
    const [targetColId, setTargetColId] = useState(null); // For adding new candidate to specific column

    // Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Fetch Data
    const fetchData = async () => {
        setLoading(true);
        const { data: cols } = await supabase().from("recruiting_columns").select("*").order("order_index");
        const { data: cands } = await supabase().from("recruiting_candidates").select("*").order("created_at", { ascending: false });

        if (cols) setColumns(cols);
        if (cands) setCandidates(cands);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    // Handlers
    const openAddCand = (colId = null) => {
        setSelectedCand(null);
        setTargetColId(colId || columns[0]?.id);
        setCandModalOpen(true);
    };

    const openEditCand = (cand) => {
        setSelectedCand(cand);
        setCandModalOpen(true);
    };

    const openAddCol = () => {
        setSelectedCol(null);
        setColModalOpen(true);
    };

    const openEditCol = (col) => {
        setSelectedCol(col);
        setColModalOpen(true);
    };

    const handleSaveCandidate = async (candData) => {
        if (candData.id) {
            // Update
            const { error } = await supabase().from("recruiting_candidates").update(candData).eq("id", candData.id);
            if (!error) setCandidates(prev => prev.map(c => c.id === candData.id ? candData : c));
        } else {
            // Insert
            const { data, error } = await supabase().from("recruiting_candidates").insert([candData]).select().single();
            if (!error && data) setCandidates(prev => [data, ...prev]);
        }
        setCandModalOpen(false);
    };

    const handleSaveColumn = async (colData) => {
        if (colData.id) {
            // Update
            const { error } = await supabase().from("recruiting_columns").update({ title: colData.title, color: colData.color }).eq("id", colData.id);
            if (!error) setColumns(prev => prev.map(c => c.id === colData.id ? { ...c, title: colData.title, color: colData.color } : c));
        } else {
            // Insert
            const maxOrder = Math.max(...columns.map(c => c.order_index), -1);
            const newCol = { title: colData.title, color: colData.color, order_index: maxOrder + 1 };
            const { data, error } = await supabase().from("recruiting_columns").insert([newCol]).select().single();
            if (!error && data) setColumns(prev => [...prev, data]);
        }
        setColModalOpen(false);
    };

    const handleDeleteColumn = async (id) => {
        if (!confirm("Spalte wirklich löschen? Kandidaten darin werden gelöscht (oder müssen verschoben werden).")) return;
        const { error } = await supabase().from("recruiting_columns").delete().eq("id", id);
        if (!error) {
            setColumns(prev => prev.filter(c => c.id !== id));
            setCandidates(prev => prev.filter(c => c.column_id !== id)); // Optimistic cleanup
        }
        setColModalOpen(false);
    };

    const handleDeleteCandidate = async (id) => {
        if (!confirm("Kandidat wirklich löschen?")) return;
        const { error } = await supabase().from("recruiting_candidates").delete().eq("id", id);
        if (!error) {
            setCandidates(prev => prev.filter(c => c.id !== id));
        }
    };

    const handleToggleMarkCandidate = async (candidate) => {
        const newVal = !candidate.is_marked;
        // Optimistic update
        setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, is_marked: newVal } : c));

        const { error } = await supabase().from("recruiting_candidates").update({ is_marked: newVal }).eq("id", candidate.id);
        if (error) {
            // Revert if error
            setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, is_marked: !newVal } : c));
        }
    };

    // Drag Handlers
    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        const isActiveCandidate = active.data.current?.type === "Candidate";
        const isOverCandidate = over.data.current?.type === "Candidate";
        const isOverColumn = over.data.current?.type === "Column";

        if (isActiveCandidate && isOverCandidate) {
            // Reorder within same column or move to another (handled by SortableContext visually)
        }

        // Moving candidate over a column (empty or not)
        if (isActiveCandidate && isOverColumn) {
            // Logic handled in DragEnd usually for persistence, but visual updates happen here via dnd-kit
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        const activeType = active.data.current?.type;

        // 1. Dragging Columns
        if (activeType === "Column" && isEditMode) {
            if (activeId !== overId) {
                const oldIndex = columns.findIndex(c => c.id === activeId);
                const newIndex = columns.findIndex(c => c.id === overId);
                const newCols = arrayMove(columns, oldIndex, newIndex);
                setColumns(newCols); // Optimistic

                // Persist Order
                const updates = newCols.map((col, idx) => ({ id: col.id, order_index: idx }));
                for (const u of updates) {
                    await supabase().from("recruiting_columns").update({ order_index: u.order_index }).eq("id", u.id);
                }
            }
            return;
        }

        // 2. Dragging Candidates
        if (activeType === "Candidate") {
            const activeCand = candidates.find(c => c.id === activeId);
            const overCand = candidates.find(c => c.id === overId);
            const overCol = columns.find(c => c.id === overId);

            let newColumnId = null;

            if (overCand) {
                // Dropped over another candidate -> take their column
                newColumnId = overCand.column_id;
            } else if (overCol) {
                // Dropped over a column directly
                newColumnId = overCol.id;
            }

            if (newColumnId && activeCand.column_id !== newColumnId) {
                // Move to new column
                setCandidates(prev => prev.map(c => c.id === activeId ? { ...c, column_id: newColumnId } : c));
                await supabase().from("recruiting_candidates").update({ column_id: newColumnId }).eq("id", activeId);
            }
        }
    };

    // Derived State
    const columnsId = useMemo(() => columns.map(c => c.id), [columns]);

    if (loading) return <div className="p-10 text-center text-slate-400">Lade Pipeline...</div>;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-1">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Recruiting Pipeline</h1>
                    <p className="text-slate-500">Manage deine Bewerber</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${isEditMode ? 'bg-amber-100 text-amber-800' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Settings size={16} />
                        {isEditMode ? "Fertig" : "Spalten bearbeiten"}
                    </button>
                    <button onClick={() => openAddCand()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition flex items-center gap-2">
                        <Plus size={18} />
                        Kandidat
                    </button>
                </div>
            </div>

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
                                    candidates={candidates.filter(c => c.column_id === col.id)}
                                    isEditMode={isEditMode}
                                    onAddCandidate={() => openAddCand(col.id)}
                                    onEditColumn={() => openEditCol(col)}
                                    onCandidateClick={(cand) => openEditCand(cand)}
                                    onDeleteCandidate={handleDeleteCandidate}
                                    onToggleMarkCandidate={handleToggleMarkCandidate}
                                />
                            ))}
                        </SortableContext>

                        {/* Add Column Button (Edit Mode) */}
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
                        // We need to know what we are dragging to render correct overlay
                        columns.find(c => c.id === activeId) ? (
                            <div className="bg-white p-3 rounded-t-xl border border-slate-300 shadow-xl w-80 opacity-90">
                                <div className="font-bold">{columns.find(c => c.id === activeId).title}</div>
                            </div>
                        ) : (
                            <div className="bg-white p-3 rounded-lg shadow-xl border border-blue-500 w-72">
                                <div className="font-bold">{candidates.find(c => c.id === activeId)?.name}</div>
                            </div>
                        )
                    ) : null}
                </DragOverlay>
            </DndContext>

            <CandidateModal
                isOpen={candModalOpen}
                onClose={() => setCandModalOpen(false)}
                candidate={selectedCand}
                columnId={targetColId}
                onSave={handleSaveCandidate}
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

