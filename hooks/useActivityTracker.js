"use client";

import { usePathname } from "next/navigation";

export function useActivityTracker() {
    const pathname = usePathname();

    const trackActivity = async (actionType, metadata = {}) => {
        try {
            // Fire and forget
            fetch("/api/track-activity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_type: actionType,
                    curr_path: window.location.pathname,
                    metadata: metadata,
                }),
                keepalive: true,
            }).catch(err => console.error("Tracking Failed:", err));
        } catch (e) {
            console.error("Tracking Error:", e);
        }
    };

    return { trackActivity };
}
