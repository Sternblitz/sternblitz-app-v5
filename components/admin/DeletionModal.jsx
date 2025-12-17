"use client";

import { useState } from "react";
import { X, Rocket, Check, AlertTriangle } from "lucide-react";

export default function DeletionModal({ isOpen, onClose, onConfirm, placeId, companyName }) {
    const [ratingRange, setRatingRange] = useState({ min: 1, max: 3 });
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setLoading(true);
        await onConfirm(ratingRange);
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-blue-600" />
                        Löschung starten
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Place ID Display */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                            Google Place ID
                        </div>
                        <div className="font-mono text-sm text-slate-700 break-all bg-white/50 p-2 rounded border border-blue-100/50">
                            {placeId || "Keine ID vorhanden"}
                        </div>
                        {!placeId && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Ohne Place ID kann keine Löschung gestartet werden.
                            </div>
                        )}
                    </div>

                    {/* Rating Selection */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-3">
                            Welche Bewertungen sollen gelöscht werden?
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "1 Stern", min: 1, max: 1 },
                                { label: "1-2 Sterne", min: 1, max: 2 },
                                { label: "1-3 Sterne", min: 1, max: 3 },
                            ].map((opt) => {
                                const isActive = ratingRange.max === opt.max;
                                return (
                                    <button
                                        key={opt.label}
                                        onClick={() => setRatingRange({ min: opt.min, max: opt.max })}
                                        className={`
                      relative px-3 py-3 rounded-xl border text-sm font-bold transition-all
                      ${isActive
                                                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20"
                                                : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                                            }
                    `}
                                    >
                                        {opt.label}
                                        {isActive && (
                                            <div className="absolute -top-2 -right-2 bg-white text-blue-600 rounded-full p-0.5 shadow-sm border border-blue-100">
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        Hinweis: Der Auftrag wird gestartet und in das Löschsystem übermittelt.
                        <div className="mt-1">Firma: <span className="font-bold text-slate-700">{companyName}</span></div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        disabled={loading}
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!placeId || loading}
                        className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? "Wird gestartet..." : "Jetzt starten 🚀"}
                    </button>
                </div>
            </div>
        </div>
    );
}
