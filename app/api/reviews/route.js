import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "";
  const address = searchParams.get("address") || "";

  // Helper to parse address
  // Google Places usually: "Street 123, 12345 City, Country"
  // Logic: Split by comma.
  // Street = First part.
  // City = Part with Zip Code (remove digits), or 2nd part.
  let street = "";
  let cityOnly = "";

  const parts = address.split(",").map(p => p.trim());

  if (parts.length > 0) {
    street = parts[0];
  } else {
    street = name; // Fallback
  }

  // Find part with digits (Zip code)
  const zipIndex = parts.findIndex(p => /\d{4,5}/.test(p));
  if (zipIndex > -1) {
    cityOnly = parts[zipIndex].replace(/[0-9]/g, "").trim();
  } else {
    // Fallback if no zip found: try 2nd part, or just use 1st part
    cityOnly = parts.length > 1 ? parts[1] : parts[0];
  }

  // Cleanup city (remove "Deutschland" if it slipped in, though usually it's separate part)
  cityOnly = cityOnly || "Unknown";

  // Construct new params for the specific server requirement:
  // company = Name
  // city = Name + ", " + Street
  // address = City
  const newParams = new URLSearchParams();
  newParams.set("company", name);
  newParams.set("city", `${name}, ${street}`);
  newParams.set("address", cityOnly);

  // Use the stable Vercel API (same as orders/refresh route)
  const upstreamBase = process.env.REVIEW_API || "https://sternblitz-review-simulator-cwnz.vercel.app/api/reviews";
  const upstream = `${upstreamBase}?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`;

  console.log("🔍 Simulator Request URL:", upstream);

  try {
    const res = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      // Increased timeout to 60s
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      // Log text for debugging
      const text = await res.text().catch(() => "");
      console.error(`Upstream Error ${res.status}: ${text}`);
      throw new Error(`Upstream ${res.status}`);
    }

    const data = await res.json();

    // Validate data structure
    const reviews = data.reviews || {};
    const r1 = Number(reviews["1"] || 0);
    const r2 = Number(reviews["2"] || 0);
    const r3 = Number(reviews["3"] || 0);
    const r4 = Number(reviews["4"] || 0);
    const r5 = Number(reviews["5"] || 0);

    const totalReviews = r1 + r2 + r3 + r4 + r5;
    let averageRating = 0.0;

    if (totalReviews > 0) {
      const sum = (1 * r1) + (2 * r2) + (3 * r3) + (4 * r4) + (5 * r5);
      averageRating = Number((sum / totalReviews).toFixed(1));
    }

    const responsePayload = {
      averageRating,
      totalReviews,
      breakdown: {
        1: r1,
        2: r2,
        3: r3,
        4: r4,
        5: r5,
      }
    };

    return NextResponse.json(responsePayload);

  } catch (e) {
    console.error("Simulator API Error:", e);

    // Return empty state instead of fake data to avoid confusion
    // User reported "80 1-3 stars" fallback was misleading
    const errorState = {
      averageRating: 0,
      totalReviews: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      isError: true,
      errorReason: e.message,
      _upstream: upstream
    };

    return NextResponse.json(errorState);
  }
}
