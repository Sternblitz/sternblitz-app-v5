"use client";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useEffect } from "react";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadGoogleMaps } from "@/lib/googleMaps";

export default function MapPage() {
    const { trackActivity } = useActivityTracker();
    const trackedRef = useRef(false);

    useEffect(() => {
        if (!trackedRef.current) {
            trackActivity("MAP_OPEN");
            trackedRef.current = true;
        }
    }, []);

    const router = useRouter();
    const mapRef = useRef(null);
    const isInitializing = useRef(false);
    const [mapInstance, setMapInstance] = useState(null);
    const [placesService, setPlacesService] = useState(null);
    const markerClustererRef = useRef(null);

    const [visits, setVisits] = useState({}); // Map: place_id -> visit object
    const [savedPlaces, setSavedPlaces] = useState([]); // Array of places from DB
    const [searchResults, setSearchResults] = useState([]); // Array of places from Search
    const [staticLeads, setStaticLeads] = useState([]); // Leads from Excel import

    const [markers, setMarkers] = useState([]);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [myLoc, setMyLoc] = useState(null);

    const [filter, setFilter] = useState("all"); // all, todo, interested, later, customer
    const [dateFilter, setDateFilter] = useState("all"); // all, today, week
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState("");

    const BLOCKED_TYPES = [
        "tourist_attraction", "park", "school", "cemetery", "place_of_worship",
        "local_government_office", "museum", "art_gallery", "zoo", "aquarium",
        "stadium", "embassy", "funeral_home", "rv_park", "campground", "library",
        "primary_school", "secondary_school", "university", "town_square"
    ];

    // Deep Scan Queries (Types & Keywords mixed)
    // Deep Scan Queries moved to server-side /api/places/nearby

    // Load Visits from DB and convert to Places
    const loadVisits = async () => {
        const { data: { user } } = await supabase().auth.getUser();
        if (!user) return;

        const { data } = await supabase()
            .from("canvassing_visits")
            .select("*")
            .eq("user_id", user.id);

        const visitMap = {};
        const dbPlaces = [];

        (data || []).forEach((v) => {
            visitMap[v.google_place_id] = v;
            // Create a "Place-like" object from the DB data
            dbPlaces.push({
                place_id: v.google_place_id,
                name: v.name,
                vicinity: v.address,
                geometry: { location: { lat: () => v.lat, lng: () => v.lng } },
                loc: { lat: v.lat, lng: v.lng },
                rating: 0, // We don't store rating, so default to 0 or fetch?
                user_ratings_total: 0,
                fromDB: true
            });
        });

        setVisits(visitMap);
        setSavedPlaces(dbPlaces);
        return { visitMap, dbPlaces };
    };

    // Haversine Distance
    const getDistance = (loc1, loc2) => {
        if (!loc1 || !loc2) return null;
        const R = 6371e3; // metres
        const φ1 = loc1.lat * Math.PI / 180;
        const φ2 = loc2.lat * Math.PI / 180;
        const Δφ = (loc2.lat - loc1.lat) * Math.PI / 180;
        const Δλ = (loc2.lng - loc1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    };

    // Init Map
    const initMap = async () => {
        if (isInitializing.current || mapInstance) return;
        isInitializing.current = true;

        console.log("initMap called. Ref:", mapRef.current, "Google:", !!window.google);
        if (!mapRef.current) {
            isInitializing.current = false;
            return;
        }

        // Load Google Maps
        try {
            await loadGoogleMaps();
        } catch (e) {
            console.error("Google Maps load failed", e);
            isInitializing.current = false;
            return;
        }

        try {
            const { Map } = await google.maps.importLibrary("maps");
            const { MarkerClusterer } = await import("@googlemaps/markerclusterer");

            // Safety check: Component might have unmounted during await
            if (!mapRef.current) {
                console.log("Map ref is null after import, aborting");
                return;
            }

            console.log("Creating Map instance...");
            const m = new Map(mapRef.current, {
                center: { lat: 48.7758, lng: 9.1829 }, // Stuttgart default
                zoom: 14,
                disableDefaultUI: true,
                zoomControl: false,
                gestureHandling: "greedy",
                styles: [
                    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
                    { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] }
                ]
            });

            setMapInstance(m);
            console.log("Map instance created");

            const { dbPlaces } = await loadVisits();
            locateMe(m);

            // Render initial DB places
            renderMarkers(m, dbPlaces, {});

            // Add listener for static leads
            m.addListener("idle", () => {
                fetchStaticLeads(m);
            });

        } catch (e) {
            console.error("Error initializing map:", e);
        }
    };

    // Fetch Static Leads (Excel Import)
    const fetchStaticLeads = async (map) => {
        if (!map) return;
        const bounds = map.getBounds();
        if (!bounds) return;

        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        try {
            const res = await fetch("/api/places/static", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    north: ne.lat(),
                    south: sw.lat(),
                    east: ne.lng(),
                    west: sw.lng()
                })
            });

            if (res.ok) {
                const data = await res.json();
                const leads = data.results || [];

                // Convert to Place format
                const formatted = leads.map(l => ({
                    place_id: "static_" + l.id,
                    name: l.name,
                    vicinity: l.address,
                    loc: { lat: l.lat, lng: l.lng },
                    geometry: { location: { lat: () => l.lat, lng: () => l.lng } },
                    category: l.category,
                    rating: l.rating || 0,
                    user_ratings_total: l.user_ratings_total || 0,
                    color: l.color, // "rot", "gelb", "grau"
                    isStatic: true
                }));

                setStaticLeads(formatted);
            }
        } catch (e) {
            console.error("Failed to load static leads", e);
        }
    };

    const locateMe = (map = mapInstance) => {
        if (!navigator.geolocation || !map) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setMyLoc(loc);
                map.setCenter(loc);
                new google.maps.Marker({
                    position: loc, map: map, title: "Ich",
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE, scale: 8,
                        fillColor: "#0b6cf2", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2
                    },
                });
            },
            () => console.warn("Location denied")
        );
    };

    useEffect(() => {
        initMap();
    }, []);

    // Render Markers with Clustering
    const renderMarkers = async (map, placesToRender, currentVisits) => {
        // Clear existing markers
        if (markerClustererRef.current) {
            markerClustererRef.current.clearMarkers();
        }
        markers.forEach(m => m.setMap(null));

        const newMarkers = [];

        placesToRender.forEach(place => {
            const visit = currentVisits[place.place_id] || visits[place.place_id];
            const isTarget = (place.rating || 5) < 4.6;
            let color = "#94a3b8";

            if (visit) color = getColor(visit.status);
            else if (place.isStatic) {
                // Map Excel colors
                const c = (place.color || "").toLowerCase();
                if (c.includes("rot") || c.includes("red")) color = "#ef4444"; // Red
                else if (c.includes("gelb") || c.includes("yellow")) color = "#eab308"; // Yellow
                else if (c.includes("grau") || c.includes("grey") || c.includes("gray")) color = "#94a3b8"; // Grey
                else color = "#ef4444"; // Default to red if unknown but imported
            }
            else if (isTarget) color = "#ef4444";

            const marker = new google.maps.Marker({
                position: place.loc,
                title: place.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE, scale: 6,
                    fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1
                },
            });

            marker.addListener("click", () => {
                const v = visits[place.place_id];
                setSelectedPlace({ ...place, visit: v });
            });
            newMarkers.push(marker);
        });

        setMarkers(newMarkers);

        // Initialize or Update Clusterer
        const { MarkerClusterer } = await import("@googlemaps/markerclusterer");

        const renderer = {
            render: ({ count, position }) => {
                return new google.maps.Marker({
                    position,
                    label: { text: String(count), color: "white", fontWeight: "bold" },
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 18,
                        fillColor: "#0f172a", // Sternblitz Dark Blue
                        fillOpacity: 0.9,
                        strokeColor: "#ffffff",
                        strokeWeight: 2,
                    },
                    zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
                });
            },
        };

        if (!markerClustererRef.current) {
            markerClustererRef.current = new MarkerClusterer({ map, markers: newMarkers, renderer });
        } else {
            markerClustererRef.current.clearMarkers();
            markerClustererRef.current.addMarkers(newMarkers);
        }
    };

    // Translate Types
    const translateType = (types) => {
        if (!types || !types.length) return "Geschäft";
        const map = {
            accounting: "Buchhaltung",
            airport: "Flughafen",
            amusement_park: "Freizeitpark",
            aquarium: "Aquarium",
            art_gallery: "Kunstgalerie",
            atm: "Geldautomat",
            bakery: "Bäckerei",
            bank: "Bank",
            bar: "Bar",
            beauty_salon: "Schönheitssalon",
            bicycle_store: "Fahrradladen",
            book_store: "Buchhandlung",
            bowling_alley: "Bowlingbahn",
            bus_station: "Busbahnhof",
            cafe: "Café",
            campground: "Campingplatz",
            car_dealer: "Autohändler",
            car_rental: "Mietwagen",
            car_repair: "Autowerkstatt",
            car_wash: "Autowaschanlage",
            casino: "Casino",
            cemetery: "Friedhof",
            church: "Kirche",
            city_hall: "Rathaus",
            clothing_store: "Bekleidungsgeschäft",
            convenience_store: "Gemischtwarenladen",
            courthouse: "Gericht",
            dentist: "Zahnarzt",
            department_store: "Kaufhaus",
            doctor: "Arzt",
            drugstore: "Drogerie",
            electrician: "Elektriker",
            electronics_store: "Elektronikmarkt",
            embassy: "Botschaft",
            fire_station: "Feuerwehr",
            florist: "Blumenladen",
            funeral_home: "Bestattungsunternehmen",
            furniture_store: "Möbelhaus",
            gas_station: "Tankstelle",
            gym: "Fitnessstudio",
            hair_care: "Friseur",
            hardware_store: "Baumarkt",
            hindu_temple: "Hindu-Tempel",
            home_goods_store: "Haushaltswaren",
            hospital: "Krankenhaus",
            insurance_agency: "Versicherung",
            jewelry_store: "Juwelier",
            laundry: "Wäscherei",
            lawyer: "Anwalt",
            library: "Bibliothek",
            light_rail_station: "S-Bahn",
            liquor_store: "Spirituosenladen",
            local_government_office: "Behörde",
            locksmith: "Schlüsseldienst",
            lodging: "Unterkunft",
            meal_delivery: "Lieferservice",
            meal_takeaway: "Imbiss",
            mosque: "Moschee",
            movie_rental: "Videothek",
            movie_theater: "Kino",
            moving_company: "Umzugsunternehmen",
            museum: "Museum",
            night_club: "Nachtclub",
            painter: "Maler",
            park: "Park",
            parking: "Parkplatz",
            pet_store: "Tierhandlung",
            pharmacy: "Apotheke",
            physiotherapist: "Physiotherapeut",
            plumber: "Klempner",
            police: "Polizei",
            post_office: "Post",
            primary_school: "Grundschule",
            real_estate_agency: "Immobilienmakler",
            restaurant: "Restaurant",
            roofing_contractor: "Dachdecker",
            rv_park: "Wohnmobilstellplatz",
            school: "Schule",
            secondary_school: "Weiterführende Schule",
            shoe_store: "Schuhgeschäft",
            shopping_mall: "Einkaufszentrum",
            spa: "Spa",
            stadium: "Stadion",
            storage: "Lager",
            store: "Geschäft",
            subway_station: "U-Bahn",
            supermarket: "Supermarkt",
            synagogue: "Synagoge",
            taxi_stand: "Taxistand",
            tourist_attraction: "Sehenswürdigkeit",
            train_station: "Bahnhof",
            transit_station: "Haltestelle",
            travel_agency: "Reisebüro",
            university: "Universität",
            veterinary_care: "Tierarzt",
            zoo: "Zoo",
        };
        for (const t of types) {
            if (map[t]) return map[t];
        }
        return "Geschäft";
    };

    // Combine & Filter Places
    const allPlaces = useMemo(() => {
        // Merge savedPlaces and searchResults, preferring searchResults for details
        const map = new Map();

        // First add saved places (from DB)
        savedPlaces.forEach(p => map.set(p.place_id, { ...p, dist: myLoc ? getDistance(myLoc, p.loc) : null }));

        // Then overwrite/add search results (they have fresher rating data!)
        searchResults.forEach(p => {
            const existing = map.get(p.place_id);
            // If we have a visit, keep the visit data but update place details from search
            map.set(p.place_id, { ...p, dist: myLoc ? getDistance(myLoc, p.loc) : null });
        });

        // Add Static Leads (if not already visited)
        staticLeads.forEach(p => {
            if (!map.has(p.place_id)) {
                map.set(p.place_id, { ...p, dist: myLoc ? getDistance(myLoc, p.loc) : null });
            }
        });

        return Array.from(map.values());
    }, [savedPlaces, searchResults, staticLeads, myLoc]);

    // Apply Filters
    const filteredPlaces = useMemo(() => {
        let res = allPlaces;

        // 1. Status Filter
        if (filter !== "all") {
            res = res.filter(p => {
                const v = visits[p.place_id];
                if (filter === "todo") return !v && (p.rating || 5) < 4.6;
                if (filter === "interested") return v?.status === "interested";
                if (filter === "later") return v?.status === "later";
                if (filter === "customer") return v?.status === "customer";
                return false;
            });
        }

        // 2. Date Filter
        if (dateFilter !== "all") {
            const now = new Date();
            res = res.filter(p => {
                const v = visits[p.place_id];
                if (!v || !v.updated_at) return false; // Only show visited items for date filter

                const d = new Date(v.updated_at);
                if (dateFilter === "today") {
                    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }
                if (dateFilter === "week") {
                    const diff = now - d;
                    return diff < 7 * 24 * 60 * 60 * 1000;
                }
                return true;
            });
        }

        // Sort by Potential (Bad ratings first, ignore small ones)
        res.sort((a, b) => {
            // Potential Score:
            // 3. Rating 1.0 - 4.5 AND Reviews >= 10 (High Potential)
            // 2. No Rating OR Reviews < 10 (Irrelevant / New) -> actually user said < 10 is irrelevant
            // 1. Rating > 4.5 (Good)

            const getScore = (p) => {
                const r = p.rating;
                const c = p.user_ratings_total || 0;

                if (c < 10) return 0; // Irrelevant (Too small)
                if (!r) return 0; // Unknown/New -> treat as small

                if (r <= 4.5) return 3; // Bad/Mediocre -> TARGET
                return 1; // Good -> Low priority
            };

            const scoreA = getScore(a);
            const scoreB = getScore(b);

            if (scoreA !== scoreB) return scoreB - scoreA; // High score first

            // Secondary sort: Distance
            return (a.dist || 0) - (b.dist || 0);
        });

        return res;
    }, [allPlaces, filter, dateFilter, visits]);

    // Update markers when filtered list changes
    useEffect(() => {
        if (mapInstance) renderMarkers(mapInstance, filteredPlaces, visits);
    }, [filteredPlaces, visits, mapInstance]);


    const getColor = (status) => {
        switch (status) {
            case "interested": return "#22c55e"; // Green
            case "later": return "#f59e0b"; // Orange
            case "customer": return "#3b82f6"; // Blue
            case "not_interested": return "#334155"; // Dark Slate (Dead lead)
            default: return "#64748b"; // Gray (Unknown/Other)
        }
    };

    const saveStatus = async (status, notes) => {
        if (!selectedPlace) return;
        const { place_id, name, vicinity, loc } = selectedPlace;

        const { data: { user } } = await supabase().auth.getUser();
        if (!user) return alert("Bitte einloggen");

        const payload = {
            user_id: user.id, google_place_id: place_id, status,
            name, address: vicinity, lat: loc.lat, lng: loc.lng,
            notes, updated_at: new Date().toISOString(),
        };

        const { error } = await supabase().from("canvassing_visits").upsert(payload, { onConflict: "user_id, google_place_id" });
        if (!error) {
            const newVisits = { ...visits, [place_id]: payload };
            setVisits(newVisits);
            setSelectedPlace({ ...selectedPlace, visit: payload });

            // Update savedPlaces if not exists
            if (!savedPlaces.find(p => p.place_id === place_id)) {
                setSavedPlaces([...savedPlaces, {
                    place_id, name, vicinity, loc, geometry: { location: { lat: () => loc.lat, lng: () => loc.lng } }, fromDB: true
                }]);
            }
        }
    };

    const deleteVisit = async () => {
        if (!selectedPlace || !selectedPlace.visit) return;
        if (!confirm("Diesen Lead wirklich löschen?")) return;

        const { error } = await supabase()
            .from("canvassing_visits")
            .delete()
            .eq("google_place_id", selectedPlace.place_id);

        if (!error) {
            const newVisits = { ...visits };
            delete newVisits[selectedPlace.place_id];
            setVisits(newVisits);
            setSelectedPlace({ ...selectedPlace, visit: null });

            // If it was ONLY in DB (not search), remove from savedPlaces
            setSavedPlaces(prev => prev.filter(p => p.place_id !== selectedPlace.place_id));
        }
    };

    // Daily Stats
    const todayStats = Object.values(visits).filter(v => {
        if (!v.updated_at) return false;
        const d = new Date(v.updated_at);
        const today = new Date();
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length;

    return (
        <div className="split-view">
            {/* MAP SECTION */}
            <div className="map-section">
                <div ref={mapRef} className="map-container" />

                {/* Daily Stats Overlay */}
                <div className="daily-stats">
                    <span className="ds-label">Heute:</span>
                    <span className="ds-val">{todayStats}</span>
                    <span className="ds-icon">🚪</span>
                </div>

                <button className="btn-locate" onClick={() => locateMe()}>📍</button>
                {/* Scan Button Removed */}
            </div>

            {/* LIST SECTION */}
            <div className="list-section tour-map-list">
                <div className="list-header">
                    <div className="lh-top">
                        <h3>Leads ({filteredPlaces.length})</h3>
                        <div className="filters">
                            <button className={`f-pill ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Alle</button>
                            <button className={`f-pill ${filter === "todo" ? "active" : ""}`} onClick={() => setFilter("todo")}>🎯 Todo</button>
                            <button className={`f-pill ${filter === "interested" ? "active" : ""}`} onClick={() => setFilter("interested")}>🔥 Heiß</button>
                            <button className={`f-pill ${filter === "later" ? "active" : ""}`} onClick={() => setFilter("later")}>⏳ Später</button>
                            <button className={`f-pill ${filter === "customer" ? "active" : ""}`} onClick={() => setFilter("customer")}>💎 Kunden</button>
                        </div>
                    </div>
                    <div className="lh-bot">
                        <div className="time-filters">
                            <button className={dateFilter === 'all' ? 'active' : ''} onClick={() => setDateFilter('all')}>📅 Alle</button>
                            <button className={dateFilter === 'today' ? 'active' : ''} onClick={() => setDateFilter('today')}>Heute</button>
                            <button className={dateFilter === 'week' ? 'active' : ''} onClick={() => setDateFilter('week')}>7 Tage</button>
                        </div>
                    </div>
                </div>
                <div className="list-content">
                    {filteredPlaces.map((p) => {
                        const isTarget = (p.rating || 5) < 4.6 && (p.user_ratings_total || 0) >= 10;
                        const isIrrelevant = (p.user_ratings_total || 0) < 10;
                        const visit = visits[p.place_id];

                        // Determine Card Color Style
                        let cardStyle = {};
                        if (p.isStatic && p.color) {
                            const c = p.color.toLowerCase();
                            if (c.includes('rot') || c.includes('red')) cardStyle = { borderLeft: '4px solid #ef4444', background: '#fef2f2' };
                            else if (c.includes('gelb') || c.includes('yellow')) cardStyle = { borderLeft: '4px solid #eab308', background: '#fefce8' };
                            else if (c.includes('grau') || c.includes('grey')) cardStyle = { borderLeft: '4px solid #94a3b8', background: '#f8fafc' };
                        }

                        return (
                            <div
                                key={p.place_id}
                                className={`place-card ${isTarget ? 'target' : ''} ${visit ? 'visited' : ''} ${isIrrelevant ? 'irrelevant' : ''}`}
                                style={cardStyle}
                                onClick={() => {
                                    setSelectedPlace({ ...p, visit });
                                    mapInstance?.panTo(p.loc);
                                }}
                            >
                                <div className="pc-left">
                                    <div className="pc-name">{p.name}</div>
                                    <div className="pc-sub">{p.category ? <span className="cat-badge">{p.category}</span> : null} {p.vicinity}</div>
                                    <div className="pc-meta">
                                        <span className={`pc-rating ${isTarget ? 'bad' : (isIrrelevant ? 'muted' : 'good')}`}>
                                            {p.rating ? p.rating.toFixed(1) : "-"} ⭐ <span className="pc-count">({p.user_ratings_total || 0})</span>
                                        </span>
                                        <span className="pc-dist">{p.dist ? Math.round(p.dist) + "m" : ""}</span>
                                    </div>
                                </div>
                                <div className="pc-right">
                                    {visit ? (
                                        <span className="status-badge" style={{ background: getColor(visit.status) }}>{visit.status === 'not_interested' ? 'Kein Int.' : visit.status === 'interested' ? 'Interesse' : visit.status === 'later' ? 'Später' : visit.status === 'customer' ? 'Kunde' : visit.status}</span>
                                    ) : (
                                        <span className="arrow">›</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filteredPlaces.length === 0 && <div className="empty-state">
                        <div className="empty-icon">🗺️</div>
                        <p>Keine Leads gefunden.</p>
                    </div>}
                </div>
            </div>

            {/* DRAWER */}
            {
                selectedPlace && (
                    <div className="drawer-overlay" onClick={() => setSelectedPlace(null)}>
                        <div className="drawer" onClick={e => e.stopPropagation()}>
                            <div className="drawer-handle" />
                            <button className="btn-close" onClick={() => setSelectedPlace(null)}>×</button>

                            {selectedPlace.visit && (
                                <button className="btn-trash" onClick={deleteVisit}>🗑️</button>
                            )}

                            <div className="d-header">
                                <h2>{selectedPlace.name}</h2>
                                <div className="d-meta">
                                    <span
                                        className={(selectedPlace.rating || 5) < 4.6 ? 'bad' : 'good'}
                                        style={selectedPlace.isStatic && selectedPlace.color ? {
                                            color: selectedPlace.color.includes('rot') || selectedPlace.color.includes('red') ? '#dc2626' :
                                                selectedPlace.color.includes('gelb') || selectedPlace.color.includes('yellow') ? '#ca8a04' : '#64748b',
                                            fontWeight: '800',
                                            fontSize: '18px'
                                        } : {}}
                                    >
                                        {selectedPlace.rating ? selectedPlace.rating.toFixed(1) : "-"} ⭐ ({selectedPlace.user_ratings_total || 0})
                                    </span>
                                    {selectedPlace.formatted_phone_number && (
                                        <a href={`tel:${selectedPlace.formatted_phone_number}`} className="d-phone">
                                            📞 {selectedPlace.formatted_phone_number}
                                        </a>
                                    )}
                                    {selectedPlace.category && <div className="d-cat">{selectedPlace.category}</div>}

                                    {/* Static Lead Color Badge */}
                                    {selectedPlace.isStatic && selectedPlace.color && (
                                        <div className="d-cat" style={{
                                            background: selectedPlace.color.includes('rot') || selectedPlace.color.includes('red') ? '#fee2e2' :
                                                selectedPlace.color.includes('gelb') || selectedPlace.color.includes('yellow') ? '#fef9c3' : '#f1f5f9',
                                            color: selectedPlace.color.includes('rot') || selectedPlace.color.includes('red') ? '#dc2626' :
                                                selectedPlace.color.includes('gelb') || selectedPlace.color.includes('yellow') ? '#ca8a04' : '#64748b'
                                        }}>
                                            🎨 {selectedPlace.color.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                {/* Navigation Button */}
                                <a
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedPlace.name + " " + selectedPlace.vicinity)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-nav"
                                >
                                    🗺️ Navigation starten
                                </a>
                            </div>

                            <div className="d-actions">
                                <div className="status-row">
                                    {[
                                        { id: "interested", label: "🔥 Interesse", color: "#22c55e" },
                                        { id: "later", label: "⏳ Später", color: "#f59e0b" },
                                        { id: "not_interested", label: "❌ Kein Int.", color: "#334155" },
                                        { id: "customer", label: "💎 Kunde", color: "#3b82f6" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            className={`st-btn ${selectedPlace.visit?.status === opt.id ? "active" : ""}`}
                                            style={{ "--c": opt.color }}
                                            onClick={() => saveStatus(opt.id, selectedPlace.visit?.notes)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    className="d-notes"
                                    placeholder="Notizen (z.B. Entscheider Name)..."
                                    defaultValue={selectedPlace.visit?.notes || ""}
                                    onBlur={(e) => saveStatus(selectedPlace.visit?.status || "todo", e.target.value)}
                                />

                                <button
                                    className="btn-main"
                                    onClick={() => {
                                        // Set Profile for Dashboard Simulator via URL (Clean & Stateless)
                                        const params = new URLSearchParams();
                                        params.set('name', selectedPlace.name);
                                        params.set('address', selectedPlace.vicinity);
                                        if (selectedPlace.url) params.set('url', selectedPlace.url);

                                        router.push(`/dashboard?${params.toString()}`);
                                    }}
                                >
                                    🚀 Simulator starten
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            <style jsx>{`
                .split-view { display: flex; flex-direction: column; height: 100vh; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                .map-section { flex: 0 0 45%; position: relative; display: flex; flex-direction: column; }
                .map-container { width: 100%; flex: 1; }

                .btn-search {
                    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
                    background: #0f172a; color: #fff; border: none; padding: 12px 24px;
                    border-radius: 99px; font-weight: 700; box-shadow: 0 8px 20px rgba(0,0,0,0.2);
                    cursor: pointer; z-index: 10; font-size: 14px; display: flex; align-items: center; gap: 8px;
                    margin-bottom: 10px; transition: all 0.2s; white-space: nowrap;
                }
                .btn-search.scanning {
                    background: #0b6cf2; cursor: wait;
                }
                .btn-locate {
                    position: absolute; top: 20px; right: 20px;
                    width: 44px; height: 44px; border-radius: 12px; background: #fff;
                    border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    font-size: 20px; cursor: pointer; z-index: 10;
                }
                .daily-stats {
                    position: absolute; top: 20px; left: 20px;
                    background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(4px);
                    padding: 8px 12px; border-radius: 12px;
                    display: flex; align-items: center; gap: 6px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10;
                }
                .ds-label { font-size: 12px; color: #64748b; font-weight: 600; }
                .ds-val { font-size: 16px; color: #0f172a; font-weight: 800; }
                .ds-icon { font-size: 14px; }

                .list-section { flex: 1; display: flex; flex-direction: column; background: #fff; border-radius: 24px 24px 0 0; margin-top: -20px; z-index: 5; overflow: hidden; box-shadow: 0 -4px 20px rgba(0,0,0,0.05); }
                .list-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
                .lh-top h3 { margin: 0 0 12px; font-size: 18px; font-weight: 800; color: #0f172a; }
                .filters { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
                .lh-bot { margin-top: 12px; }
                .time-filters {
                    display: inline-flex; background: #f1f5f9; padding: 4px; border-radius: 12px;
                }
                .time-filters button {
                    border: none; background: transparent; padding: 6px 14px; border-radius: 8px;
                    font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s;
                }
                .time-filters button.active {
                    background: #fff; color: #0f172a; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .f-pill {
                    background: #f1f5f9; border: none; padding: 6px 14px; border-radius: 99px;
                    font-size: 13px; font-weight: 600; color: #64748b; white-space: nowrap; cursor: pointer;
                }
                .f-pill.active { background: #0f172a; color: #fff; }

                .list-content { flex: 1; overflow-y: auto; padding: 0; background: #f8fafc; }
                .place-card {
                    background: #fff; padding: 16px 20px; border-bottom: 1px solid #f1f5f9;
                    display: flex; align-items: center; justify-content: space-between;
                    transition: background 0.2s; cursor: pointer;
                }
                .place-card:active { background: #f1f5f9; }
                .place-card.target { background: #fff5f5; }
                .place-card.visited { opacity: 0.7; background: #f8fafc; }
                .place-card.irrelevant { opacity: 0.5; filter: grayscale(0.8); }

                .pc-name { font-weight: 700; color: #0f172a; font-size: 15px; margin-bottom: 2px; }
                .pc-sub { font-size: 13px; color: #64748b; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
                .pc-meta { display: flex; align-items: center; gap: 10px; font-size: 13px; }
                .pc-rating { font-weight: 700; }
                .pc-rating.bad { color: #dc2626; }
                .pc-rating.good { color: #16a34a; }
                .pc-rating.muted { color: #94a3b8; font-weight: 400; }
                .pc-count { font-weight: 400; color: #94a3b8; font-size: 12px; }
                .pc-dist { color: #94a3b8; font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }

                .status-badge { font-size: 10px; font-weight: 700; color: #fff; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; }
                .arrow { color: #cbd5e1; font-size: 20px; font-weight: 700; }

                .empty-state { padding: 60px 20px; text-align: center; color: #94a3b8; }
                .empty-icon { font-size: 40px; margin-bottom: 10px; }

                /* Drawer */
                .drawer-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 50;
                    display: flex; align-items: flex-end; backdrop-filter: blur(2px);
                }
                .drawer {
                    width: 100%; background: #fff; border-radius: 24px 24px 0 0;
                    padding: 24px; position: relative; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    max-height: 85vh; overflow-y: auto;
                }
                .drawer-handle { width: 40px; height: 4px; background: #e2e8f0; border-radius: 10px; margin: 0 auto 20px; }
                .btn-close {
                    position: absolute; top: 20px; right: 20px; background: #f1f5f9;
                    width: 32px; height: 32px; border-radius: 50%; border: none; font-size: 20px; cursor: pointer;
                }
                
                .d-header { margin-bottom: 24px; text-align: center; }
                .d-header h2 { margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #0f172a; }
                .d-meta { display: flex; flex-direction: column; gap: 4px; align-items: center; font-size: 15px; color: #64748b; }
                .d-phone { color: #0b6cf2; text-decoration: none; font-weight: 600; background: #eff6ff; padding: 4px 12px; border-radius: 99px; margin-top: 4px; display: inline-block; }
                .d-cat { font-size: 13px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; margin-top: 6px; }
                .cat-badge { font-size: 11px; font-weight: 700; color: #475569; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
                .btn-nav {
                    display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
                    background: #f1f5f9; color: #0f172a; padding: 8px 16px; border-radius: 99px;
                    font-size: 13px; font-weight: 600; text-decoration: none;
                }
                .bad { color: #dc2626; font-weight: 700; }
                .good { color: #16a34a; font-weight: 700; }

                .status-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                .st-btn {
                    padding: 14px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff;
                    font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s;
                }
                .st-btn.active { background: var(--c); color: #fff; border-color: var(--c); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

                .d-notes {
                    width: 100%; height: 80px; background: #f8fafc; border: 1px solid #e2e8f0;
                    border-radius: 12px; padding: 12px; font-family: inherit; margin-bottom: 20px;
                    font-size: 15px;
                }
                .btn-main {
                    width: 100%; padding: 18px; background: #0b6cf2; color: #fff; border: none;
                    border-radius: 16px; font-size: 18px; font-weight: 800; cursor: pointer;
                    box-shadow: 0 8px 20px rgba(11, 108, 242, 0.3);
                }

                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            `}</style>
        </div >
    );
}
