// Batches un-triaged replies to Gemini for priority + summary + suggested
// next action, then best-effort writes the results back to the Sheet (via
// the Apps Script bridge) so they're cached and don't get re-classified on
// the next poll. This is the only place an LLM gets called from — the list
// route (/api/emails) just reads whatever's already cached in the Sheet.
export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function buildPrompt(items) {
  return `You are triaging replies to a cold email outreach campaign for Caldarium, a documentation-readiness platform for healthcare prior-authorization teams. For each item below, read the reply the prospect sent and decide how urgently a human should act on it.

Return ONLY a JSON array (same order, same length as the input, no other text) where each element is:
{
  "threadId": "<echoed back exactly as given>",
  "priority": "high" | "medium" | "low",
  "summary": "<one plain, specific sentence describing what they said>",
  "action": "<one concrete next step for the sales rep, under 12 words>"
}

Priority guide:
- high: expressed genuine interest, asked to schedule a call/demo, asked pricing or detailed questions, agreed to the form/meeting.
- medium: ambiguous, asked a clarifying question, said "maybe later", forwarded to a colleague, an out-of-office WITH a specific return date.
- low: explicitly not interested, an unsubscribe/stop request, irrelevant or spam content, a bounce notice, or a plain automated out-of-office with nothing else.

Items:
${JSON.stringify(items, null, 2)}`;
}

async function writeBackToSheet(results) {
  const url = process.env.OUTREACH_WEBAPP_URL;
  const secret = process.env.OUTREACH_SECRET;
  if (!url || !secret || !results.length) return;
  try {
    await fetch(`${url}?secret=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: results }),
      cache: "no-store",
    });
  } catch {
    // Non-fatal: the dashboard still shows results this session even if the
    // write-back to the Sheet fails (e.g. bridge temporarily unreachable).
  }
}

export async function POST(request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "GEMINI_API_KEY is not set. Add it in Vercel (Google AI Studio issues these) and redeploy." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 25);
  if (items.length === 0) return Response.json({ results: [] });

  const prompt = buildPrompt(
    items.map((it) => ({
      threadId: it.threadId,
      firstName: it.firstName,
      organization: it.organization,
      originalSubject: it.replySubject,
      replySnippet: (it.replySnippet || "").slice(0, 1000),
    }))
  );

  let geminiRes;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        cache: "no-store",
      }
    );
  } catch (err) {
    return Response.json({ error: `Failed to reach Gemini: ${err.message}` }, { status: 502 });
  }

  if (!geminiRes.ok) {
    const text = await geminiRes.text().catch(() => "");
    return Response.json({ error: `Gemini responded ${geminiRes.status}: ${text || geminiRes.statusText}` }, { status: 502 });
  }

  const raw = await geminiRes.json();
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  let results;
  try {
    results = JSON.parse(text);
  } catch {
    results = [];
  }
  if (!Array.isArray(results)) results = [];

  await writeBackToSheet(results);

  return Response.json({ results });
}
