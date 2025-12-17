// app/api/reviews/route.js

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "";
  const address = searchParams.get("address") || "";

  // 1) Upstream-URL: aus ENV, sonst Default
  const upstreamBase =
    process.env.REVIEW_API ||
    "https://sternblitz-review-simulator-cwnz.vercel.app/api/reviews";

  const upstream = `${upstreamBase}?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`;

  console.log("🔍 Simulator Request URL:", upstream); // Debug Log

  try {
    const res = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    // 2) Wenn Upstream antwortet, aber mit Fehler → wir geben es sichtbar zurück
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // ---- Fallback-Demo-Daten, damit UI trotzdem rendert ----
      const demo = {
        averageRating: 3.7,
        totalReviews: 421,
        breakdown: { 1: 50, 2: 60, 3: 90, 4: 120, 5: 101 },
        _fallback: true,
        _reason: `Upstream ${res.status}`,
        _upstream: upstream,
        _body: text.slice(0, 500),
      };
      return new Response(JSON.stringify(demo), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3) Normale Antwort durchreichen
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // 4) Netzwerk-/Timeout-Fehler → Demo zurück, aber mit Grund
    const demo = {
      averageRating: 4.0,
      totalReviews: 250,
      breakdown: { 1: 20, 2: 25, 3: 35, 4: 80, 5: 90 },
      _fallback: true,
      _reason: e?.message || String(e),
      _upstream: upstream,
    };
    return new Response(JSON.stringify(demo), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
