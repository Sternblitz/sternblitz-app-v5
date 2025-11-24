"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Script from "next/script";
import { supabase } from "@/lib/supabaseClient";

export default function MapPage() {
    const mapRef = useRef(null);
    const [mapInstance, setMapInstance] = useState(null);
    const [placesService, setPlacesService] = useState(null);

    const [visits, setVisits] = useState({}); // Map: place_id -> visit object
    const [savedPlaces, setSavedPlaces] = useState([]); // Array of places from DB
    const [searchResults, setSearchResults] = useState([]); // Array of places from Search

    const [markers, setMarkers] = useState([]);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [myLoc, setMyLoc] = useState(null);
    const [scriptLoaded, setScriptLoaded] = useState(false);

    const [filter, setFilter] = useState("all"); // all, todo, interested, later, customer
    const [dateFilter, setDateFilter] = useState("all"); // all, today, week

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
        if (!window.google?.maps || !mapRef.current) return;

        const { Map } = await google.maps.importLibrary("maps");
        const { PlacesService } = await google.maps.importLibrary("places");

        const m = new Map(mapRef.current, {
            center: { lat: 52.52, lng: 13.405 }, // Berlin default
            zoom: 15,
            mapId: "DEMO_MAP_ID",
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: "greedy",
            styles: [
                { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
                { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] }
            ]
        });

        setMapInstance(m);
        setPlacesService(new PlacesService(m));

        const { dbPlaces } = await loadVisits();
        locateMe(m);

        // Render initial DB places
        renderMarkers(m, dbPlaces, {});
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

    useEffect(() => { if (scriptLoaded) initMap(); }, [scriptLoaded]);

    // Render Markers
    const renderMarkers = (map, placesToRender, currentVisits) => {
        // Clear existing
        markers.forEach(m => m.setMap(null));
        const newMarkers = [];

        placesToRender.forEach(place => {
            const visit = currentVisits[place.place_id] || visits[place.place_id];
            const isTarget = (place.rating || 5) < 4.6;
            let color = "#94a3b8";
            if (visit) color = getColor(visit.status);
            else if (isTarget) color = "#ef4444";

            const marker = new google.maps.Marker({
                map: map, position: place.loc, title: place.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE, scale: 6,
                    fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1
                },
            });

            marker.addListener("click", () => {
                const v = visits[place.place_id];
                setSelectedPlace({ ...place, visit: v });
                // Fetch details if missing
                if (!place.formatted_phone_number && placesService) {
                    placesService.getDetails({
                        placeId: place.place_id,
                        fields: ["formatted_phone_number", "url", "website", "rating", "user_ratings_total"]
                    }, (details, st) => {
                        if (st === google.maps.places.PlacesServiceStatus.OK && details) {
                            setSelectedPlace(prev => ({ ...prev, ...details }));
                        }
                    });
                }
            });
            newMarkers.push(marker);
        });
        setMarkers(newMarkers);
    };

    // Search Nearby (Visible Area)
    const searchNearby = () => {
        if (!mapInstance || !placesService) return;

        const bounds = mapInstance.getBounds();
        if (!bounds) return;

        const request = {
            bounds: bounds,
            type: "establishment",
        };

        placesService.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                const processed = results.map(p => {
                    const loc = { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() };
                    const dist = myLoc ? getDistance(myLoc, loc) : null;
                    return { ...p, dist, loc };
                });
                setSearchResults(processed);
            }
        });
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

        return Array.from(map.values());
    }, [savedPlaces, searchResults, myLoc]);

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

        // Sort
        res.sort((a, b) => {
            const aLow = (a.rating || 5) < 4.6;
            const bLow = (b.rating || 5) < 4.6;
            if (aLow && !bLow) return -1;
            if (!aLow && bLow) return 1;
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
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places,marker`}
                strategy="afterInteractive"
                onLoad={() => setScriptLoaded(true)}
            />

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
                <button className="btn-search" onClick={searchNearby}>🔍 Bereich suchen</button>
            </div>

            {/* LIST SECTION */}
            <div className="list-section">
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
                        const isTarget = (p.rating || 5) < 4.6;
                        const visit = visits[p.place_id];
                        return (
                            <div
                                key={p.place_id}
                                className={`place-card ${isTarget ? 'target' : ''} ${visit ? 'visited' : ''}`}
                                onClick={() => {
                                    setSelectedPlace({ ...p, visit });
                                    mapInstance?.panTo(p.loc);
                                }}
                            >
                                <div className="pc-left">
                                    <div className="pc-name">{p.name}</div>
                                    <div className="pc-sub">{p.vicinity}</div>
                                    <div className="pc-meta">
                                        <span className={`pc-rating ${isTarget ? 'bad' : 'good'}`}>
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
            {selectedPlace && (
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
                                <span className={(selectedPlace.rating || 5) < 4.6 ? 'bad' : 'good'}>
                                    {selectedPlace.rating ? selectedPlace.rating.toFixed(1) : "-"} ⭐ ({selectedPlace.user_ratings_total || 0})
                                </span>
                                {selectedPlace.formatted_phone_number && (
                                    <a href={`tel:${selectedPlace.formatted_phone_number}`} className="d-phone">
                                        📞 {selectedPlace.formatted_phone_number}
                                    </a>
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
                                    // Set Profile for Dashboard Simulator
                                    const profile = {
                                        name: selectedPlace.name,
                                        address: selectedPlace.vicinity,
                                        url: selectedPlace.url || ""
                                    };
                                    sessionStorage.setItem("sb_selected_profile", JSON.stringify(profile));
                                    window.location.href = "/dashboard";
                                }}
                            >
                                🚀 Simulator starten
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .split-view { display: flex; flex-direction: column; height: 100vh; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                .map-section { flex: 0 0 45%; position: relative; }
                .map-container { width: 100%; height: 100%; }

                .btn-search {
                    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
                    background: #0f172a; color: #fff; border: none; padding: 12px 24px;
                    border-radius: 99px; font-weight: 700; box-shadow: 0 8px 20px rgba(0,0,0,0.2);
                    cursor: pointer; z-index: 10; font-size: 14px; display: flex; align-items: center; gap: 8px;
                    margin-bottom: 10px;
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

                .pc-name { font-weight: 700; color: #0f172a; font-size: 15px; margin-bottom: 2px; }
                .pc-sub { font-size: 13px; color: #64748b; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
                .pc-meta { display: flex; align-items: center; gap: 10px; font-size: 13px; }
                .pc-rating { font-weight: 700; }
                .pc-rating.bad { color: #dc2626; }
                .pc-rating.good { color: #16a34a; }
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
        </div>
    );
}
