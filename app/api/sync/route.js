// Comprehensive Vapi -> Supabase sync. Covers every resource category beyond
// Calls (which dual-write on every /api/calls[/[id]] request instead, since
// those are already polled live by the dashboard). This route also runs a
// bounded backfill pass over Calls, fetching full transcript/messages for
// any call that has only ever been partially synced (i.e. never opened in
// the dashboard), so "everything Vapi exposes" ends up in Supabase even for
// calls nobody clicked into.
//
// Triggered by Vercel Cron (daily) using the CRON_SECRET convention -- Vercel
// automatically sends `Authorization: Bearer ${CRON_SECRET}` for its own
// cron invocations, so this route just verifies that header. Also callable
// manually (e.g. `curl -H "Authorization: Bearer $CRON_SECRET" .../api/sync`)
// to run the initial full backfill.
import { extractAnalysis } from "@/lib/vapi-analysis";
import { generateCallSummary } from "@/lib/gemini-summary";
import { getSupabase } from "@/lib/supabase";
import {
  upsertCallDetail,
  syncAssistants,
  syncPhoneNumbers,
  syncTools,
  syncSquads,
  syncFiles,
  syncChats,
  syncSessions,
  syncEvals,
  syncEvalRuns,
  saveAnalyticsSnapshot,
  logSync,
} from "@/lib/supabase-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VAPI_BASE = "https://api.vapi.ai";
const BACKFILL_BATCH_SIZE = 40; // bound per-run work so we stay inside maxDuration

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet -- allow, but this should be set in production
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function vapiList(path, key, extraParams) {
  const params = new URLSearchParams(extraParams || {});
  const res = await fetch(`${VAPI_BASE}${path}${params.toString() ? `?${params}` : ""}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  const raw = await res.json();
  return Array.isArray(raw) ? raw : raw.results || raw.data || [];
}

async function backfillCallDetails(key) {
  const sb = getSupabase();
  if (!sb) return { fetched: 0, updated: 0 };

  // Calls that only have the lightweight list-route row so far (no transcript yet).
  const { data: rows, error } = await sb
    .from("vapi_calls")
    .select("id")
    .is("transcript", null)
    .order("started_at", { ascending: false })
    .limit(BACKFILL_BATCH_SIZE);

  if (error) {
    await logSync("call_backfill", "error", error.message);
    return { fetched: 0, updated: 0 };
  }
  if (!rows || !rows.length) return { fetched: 0, updated: 0 };

  let updated = 0;
  for (const { id } of rows) {
    try {
      const res = await fetch(`${VAPI_BASE}/call/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const raw = await res.json();
      const { summary, structuredData } = extractAnalysis(raw);
      const transcript = raw.transcript || (raw.artifact && raw.artifact.transcript) || null;
      const messagesRaw =
        raw.messages || (raw.artifact && raw.artifact.messages) || (raw.artifact && raw.artifact.messagesOpenAIFormatted) || [];
      const messages = messagesRaw
        .filter((m) => m && (m.message || m.content) && m.role !== "system")
        .map((m) => ({
          role: m.role === "bot" || m.role === "assistant" ? "assistant" : "user",
          text: m.message || m.content || "",
          secondsFromStart: typeof m.secondsFromStart === "number" ? m.secondsFromStart : null,
        }));
      // Same treatment as opening the call in the dashboard: regenerate a
      // clean summary from the transcript via Gemini rather than settling
      // for whatever Vapi's own (often inconsistent/deprecated) analysis
      // produced. Falls back to Vapi's summary if Gemini is unavailable or
      // there's no transcript to work from.
      const freshSummary = await generateCallSummary(messages);
      await upsertCallDetail(raw, {
        transcript,
        messages,
        summary: freshSummary || summary || null,
        vapiSummary: (raw.analysis && raw.analysis.summary) || raw.summary || null,
        structuredData,
      });
      updated += 1;
    } catch {
      // skip this one, keep going
    }
  }
  await logSync("call_backfill", "ok", `${updated}/${rows.length} backfilled`);
  return { fetched: rows.length, updated };
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) {
    return Response.json({ error: "VAPI_PRIVATE_KEY is not set." }, { status: 500 });
  }
  if (!getSupabase()) {
    return Response.json(
      { error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set." },
      { status: 500 }
    );
  }

  const results = {};

  const jobs = [
    ["assistants", "/assistant", syncAssistants],
    ["phoneNumbers", "/phone-number", syncPhoneNumbers],
    ["tools", "/tool", syncTools],
    ["squads", "/squad", syncSquads],
    ["files", "/file", syncFiles],
    ["chats", "/chat", syncChats],
    ["sessions", "/session", syncSessions],
    ["evals", "/eval", syncEvals],
  ];

  for (const [key_, path, syncFn] of jobs) {
    try {
      const list = await vapiList(path, key, { limit: "1000" });
      results[key_] = await syncFn(list);
    } catch (err) {
      results[key_] = { error: err.message };
      await logSync(key_, "error", err.message);
    }
  }

  // Best-effort eval runs, one request per eval (Vapi doesn't expose a
  // flat "all runs" list endpoint).
  try {
    const sb = getSupabase();
    const { data: evals } = sb ? await sb.from("vapi_evals").select("id") : { data: [] };
    let allRuns = [];
    for (const ev of evals || []) {
      try {
        const runs = await vapiList(`/eval/${ev.id}/run`, key);
        allRuns = allRuns.concat(runs.map((r) => ({ ...r, evalId: r.evalId || ev.id })));
      } catch {
        // this eval's runs endpoint may not exist / may be empty -- skip
      }
    }
    results.evalRuns = await syncEvalRuns(allRuns);
  } catch (err) {
    results.evalRuns = { error: err.message };
  }

  // Lightweight default analytics snapshot: daily call volume + cost by assistant.
  try {
    const res = await fetch(`${VAPI_BASE}/analytics`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: [
          {
            table: "call",
            name: "daily_volume_and_cost",
            timeRange: { step: "day" },
            groupBy: ["assistantId", "endedReason"],
            operations: [
              { operation: "count", column: "id" },
              { operation: "sum", column: "cost" },
              { operation: "avg", column: "duration" },
            ],
          },
        ],
      }),
      cache: "no-store",
    });
    if (res.ok) {
      const analytics = await res.json();
      await saveAnalyticsSnapshot({ table: "call", step: "day" }, analytics);
      results.analytics = "ok";
    } else {
      results.analytics = { error: `status ${res.status}` };
    }
  } catch (err) {
    results.analytics = { error: err.message };
  }

  // Bounded backfill of full call detail for calls only partially synced so far.
  results.callBackfill = await backfillCallDetails(key);

  return Response.json({ ok: true, results, syncedAt: new Date().toISOString() });
}
