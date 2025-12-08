const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const libraries = "places,marker";

let apiPromise = null;

export const loadGoogleMaps = () => {
    if (apiPromise) return apiPromise;

    apiPromise = new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            resolve(null);
            return;
        }

        if (window.google && window.google.maps) {
            resolve(window.google.maps);
            return;
        }

        // Check if script is already in DOM (to avoid duplicates from other sources)
        const existingScript = document.querySelector(`script[src*="maps.googleapis.com/maps/api/js"]`);
        if (existingScript) {
            existingScript.addEventListener("load", () => resolve(window.google.maps));
            existingScript.addEventListener("error", (e) => reject(e));
            return;
        }

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries}&v=weekly&loading=async`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
            if (window.google && window.google.maps) {
                resolve(window.google.maps);
            } else {
                reject(new Error("Google Maps loaded but window.google.maps is undefined"));
            }
        };

        script.onerror = (e) => reject(new Error("Google Maps script failed to load"));

        document.head.appendChild(script);
    });

    return apiPromise;
};
