// Per-call detail route. Includes the full transcript + turn-by-turn
// messages + recording URL, which we deliberately leave out of the list
// route (/api/calls) to keep that payload small for the overview/table views.
import { extractAnalysis } from "@/lib/vapi-analysis";
import { generateCallSummary } from "@/lib/gemini-summary";
import { upsertCallDetail } from "@/lib/supabase-sync";

export const dynamic = "force-dynamic";

const VAPI_BASE = "https://api.vapi.ai";

function normalizeMessages(c) {
  const raw =
    c.messages ||
    (c.artifact && c.artifact.messages) ||
    (c.artifact && c.artifact.messagesOpenAIFormatted) ||
    [];
  return raw
    .filter((m) => m && (m.message || m.content) && m.role !== "system")
    .map((m) => ({
      role: m.role === "bot" || m.role === "assistant" ? "assistant" : "user",
      text: m.message || m.content || "",
      secondsFromStart:
        typeof m.secondsFromStart === "number" ? m.secondsFromStart : null,
    }));
}

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
    recordingUrl: c.recordingUrl || (c.artifact && c.artifact.recordingUrl) || null,
    transcript: c.transcript || (c.artifact && c.artifact.transcript) || null,
    messages: normalizeMessages(c),
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

export async function GET(request, { params }) {
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) {
    return Response.json(
      { error: "VAPI_PRIVATE_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const { id } = params;
  let res;
  try {
    res = await fetch(`${VAPI_BASE}/call/${id}`, {
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
  const call = normalizeCall(raw);

  // Regenerate the summary fresh from the transcript via Gemini, which fixes
  // quality for BOTH old calls (verbose/markdown-heavy from a since-changed
  // Vapi prompt) and new ones -- independent of Vapi's own analysis or
  // Structured Outputs. Falls back to whatever Vapi provided if there's no
  // GEMINI_API_KEY set, no transcript, or the request fails.
  const freshSummary = await generateCallSummary(call.messages);
  if (freshSummary) call.summaryText = freshSummary;

  // Dual-write the full-fidelity record (transcript, messages, structured
  // data, both the fresh Gemini summary and Vapi's own) into Supabase.
  const { structuredData: sd } = extractAnalysis(raw);
  await upsertCallDetail(raw, {
    transcript: call.transcript,
    messages: call.messages,
    summary: call.summaryText,
    vapiSummary: (raw.analysis && raw.analysis.summary) || raw.summary || null,
    structuredData: sd,
  });

  return Response.json({ call });
}
