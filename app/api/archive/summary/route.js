// Reads straight from Supabase -- this is the "use the Supabase data to
// visualize in the dashboard" piece. Vapi's own /call list is capped at
// VAPI_FETCH_LIMIT (see app/api/calls/route.js), so anything beyond that
// window only lives in Supabase. This route surfaces the full-history view:
// total calls ever synced, and daily volume going back further than the live
// feed shows.
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabase();
  if (!sb) {
    return Response.json({ configured: false });
  }

  try {
    const { count: totalCalls, error: countErr } = await sb
      .from("vapi_calls")
      .select("id", { count: "exact", head: true });
    if (countErr) throw countErr;

    const { data: earliest } = await sb
      .from("vapi_calls")
      .select("started_at")
      .not("started_at", "is", null)
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: recent, error: recentErr } = await sb
      .from("vapi_calls")
      .select("started_at, cost, duration_seconds")
      .not("started_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(2000);
    if (recentErr) throw recentErr;

    const byDay = new Map();
    let totalCost = 0;
    for (const row of recent || []) {
      const day = new Date(row.started_at).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
      if (typeof row.cost === "number") totalCost += row.cost;
    }
    const volume = Array.from(byDay.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .slice(-90);

    return Response.json({
      configured: true,
      totalCalls: totalCalls || 0,
      totalCostSampled: totalCost,
      earliestCallAt: earliest ? earliest.started_at : null,
      volume,
    });
  } catch (err) {
    return Response.json({ configured: true, error: err.message }, { status: 500 });
  }
}
