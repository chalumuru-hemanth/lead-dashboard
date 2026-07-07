// Server-side route. Runs on the server only, so VAPI_PRIVATE_KEY never
// reaches the browser. Returns a lightweight list (no transcript/messages —
// those are fetched per-call from /api/calls/[id] to keep this payload small).
import { extractAnalysis } from "@/lib/vapi-analysis";

export const dynamic = "force-dynamic";

const VAPI_BASE = "https://api.vapi.ai";

function normalizeCall(c) {
  const { summary, structuredData: sd } = extractAnalysis(c);
  const startedAt = c.startedAt ? new Date(c.startedAt) : null;
  const endedAt = c.endedAt ? new Date(c.endedAt) : null;

  return {
    id: c.id,
    createdAt: c.createdAt,
    endedReason: c.endedReason || null,
    cost: typeof c.cost === "number" ? c.cost : null,
    durationSeconds:
      startedAt && endedAt ? Math.max(0, (endedAt - startedAt) / 1000) : null,
    hasRecording: !!(c.recordingUrl || (c.artifact && c.artifact.recordingUrl)),
    summaryText: summary,
    hasStructuredData: !!sd,
    contact: (sd && sd.contact) || null,
    intent: (sd && sd.intent) || null,
    outcome: (sd && sd.outcome) || null,
    sentiment: (sd && sd.sentiment) || null,
    prior_auth: (sd && sd.prior_auth) || null,
    qualification: (sd && sd.qualification) || null,
    follow_up: (sd && sd.follow_up) || null,
  };
}

export async function GET() {
  const key = process.env.VAPI_PRIVATE_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const limit = process.env.VAPI_FETCH_LIMIT || "200";

  if (!key) {
    return Response.json(
      {
        error:
          "VAPI_PRIVATE_KEY is not set. Add it to your environment (see README.md) and redeploy/restart.",
      },
      { status: 500 }
    );
  }

  const params = new URLSearchParams();
  if (assistantId) params.set("assistantId", assistantId);
  params.set("limit", limit);

  let res;
  try {
    res = await fetch(`${VAPI_BASE}/call?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch (err) {
    return Response.json(
      { error: `Failed to reach Vapi API: ${err.message}` },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json(
      { error: `Vapi API responded ${res.status}: ${text || res.statusText}` },
      { status: res.status }
    );
  }

  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : raw.results || raw.data || [];
  const calls = list
    .map(normalizeCall)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return Response.json({ calls, fetchedAt: new Date().toISOString() });
}
