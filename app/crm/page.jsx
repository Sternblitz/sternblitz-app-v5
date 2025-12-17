"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function CrmEntryPage() {
    const [clicks, setClicks] = useState(0);
    const router = useRouter();

    const handleLogoClick = () => {
        const newCount = clicks + 1;
        setClicks(newCount);

        if (newCount >= 5) {
            // Secret unlock
            router.push("/admin/crm");
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
            <div className="text-center space-y-6">
                {/* Logo with secret click handler */}
                <div
                    onClick={handleLogoClick}
                    className="relative w-24 h-24 mx-auto cursor-default transition-transform active:scale-95 select-none"
                >
                    <Image
                        src="/logo.png"
                        alt="Sternblitz"
                        fill
                        className="object-contain opacity-50 hover:opacity-100 transition-opacity duration-300"
                    />
                </div>

                {/* Disguise Text */}
                <div>
                    <h1 className="text-xl font-medium text-slate-400">Wartungsarbeiten</h1>
                    <p className="text-sm text-slate-300 mt-2">Diese Seite ist aktuell im Aufbau.</p>
                </div>
            </div>
        </div>
    );
}
