import { NextResponse } from "next/server";
import { supabaseServerAuth } from "@/lib/supabaseServerAuth";

export const dynamic = "force-dynamic";

const DEFAULT_REVIEW_API =
  "https://sternblitz-review-simulator-cwnz.vercel.app/api/reviews";

function normalizeBreakdown(raw) {
  if (!raw || typeof raw !== "object") return {};
  const normalized = {};
  [1, 2, 3, 4, 5].forEach((star) => {
    const val = Number(raw[star]);
    if (Number.isFinite(val)) normalized[star] = val;
  });
  return normalized;
}

function pickQueryParts(order) {
  const byColumn = {
    name: order?.review_name || null,
    address: order?.review_address || null,
  };

  if (!byColumn.name && typeof order?.google_profile === "string") {
    const parts = order.google_profile.split(",");
    const namePart = parts.shift();
    const addressPart = parts.join(",");
    byColumn.name = namePart ? namePart.trim() || null : null;
    byColumn.address = addressPart ? addressPart.trim() || null : null;
  }

  return {
    name: byColumn.name,
    address: byColumn.address,
  };
}

async function fetchLiveStats(name, address) {
  const base = process.env.REVIEW_API || DEFAULT_REVIEW_API;
  const url = `${base}?name=${encodeURIComponent(name || "")}&address=${encodeURIComponent(
    address || ""
  )}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Upstream responded with ${res.status}`);
    err.details = body;
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const breakdown = normalizeBreakdown(data?.breakdown);

  return {
    totalReviews: Number(data?.totalReviews),
    averageRating: Number(data?.averageRating),
    breakdown,
  };
}

export async function POST(_req, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Order-ID fehlt." }, { status: 400 });
    }

    const supabase = await supabaseServerAuth();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
          id,
          google_profile,
          company,
          first_name,
          last_name,
          email,
          phone,
          selected_option,
          counts,
          pdf_path,
          pdf_signed_url,
          status,
          created_at,
          last_refreshed_at,
          start_total_reviews,
          start_average_rating,
          start_bad_1,
          start_bad_2,
          start_bad_3,
          live_total_reviews,
          live_average_rating,
          live_bad_1,
          live_bad_2,
          live_bad_3,
          review_name,
          review_address
        `
      )
      .eq("id", id)
      .maybeSingle();

    if (orderError) {
      if (orderError.code === "PGRST116") {
        return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
      }
      throw orderError;
    }

    if (!order) {
      return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
    }

    const { name, address } = pickQueryParts(order);
    if (!name) {
      return NextResponse.json(
        { error: "Für diesen Auftrag fehlt ein Name zum Aktualisieren." },
        { status: 400 }
      );
    }

    const liveStats = await fetchLiveStats(name, address);

    if (!Number.isFinite(liveStats.totalReviews) || !liveStats.breakdown) {
      return NextResponse.json(
        { error: "Antwort der Bewertungs-API unvollständig." },
        { status: 502 }
      );
    }

    const breakdown = liveStats.breakdown;
    const liveBad1 = Number.isFinite(breakdown[1]) ? breakdown[1] : null;
    const liveBad2 = Number.isFinite(breakdown[2]) ? breakdown[2] : null;
    const liveBad3 = Number.isFinite(breakdown[3]) ? breakdown[3] : null;
    const nowIso = new Date().toISOString();

    const updates = {
      live_total_reviews: Number.isFinite(liveStats.totalReviews)
        ? Math.round(liveStats.totalReviews)
        : null,
      live_average_rating: Number.isFinite(liveStats.averageRating)
        ? Number(liveStats.averageRating.toFixed(2))
        : null,
      live_bad_1: liveBad1,
      live_bad_2: liveBad2,
      live_bad_3: liveBad3,
      last_refreshed_at: nowIso,
    };

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select(
        `
          id,
          google_profile,
          company,
          first_name,
          last_name,
          email,
          phone,
          selected_option,
          counts,
          pdf_path,
          pdf_signed_url,
          status,
          created_at,
          last_refreshed_at,
          start_total_reviews,
          start_average_rating,
          start_bad_1,
          start_bad_2,
          start_bad_3,
          live_total_reviews,
          live_average_rating,
          live_bad_1,
          live_bad_2,
          live_bad_3,
          review_name,
          review_address
        `
      )
      .maybeSingle();

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, row: updated });
  } catch (error) {
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    console.error("orders refresh error:", error);
    return NextResponse.json(
      { error: error?.message || "Aktualisierung fehlgeschlagen." },
      { status: status >= 400 && status <= 599 ? status : 500 }
    );
  }
}
