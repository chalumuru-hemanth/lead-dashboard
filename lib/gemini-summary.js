// Generates a clean, plain-prose call summary directly from the transcript,
// independent of whatever Vapi's own analysis/Structured Outputs produced.
// This is what actually fixes summary quality for BOTH old and new calls:
// it's regenerated fresh from the transcript every time a call's detail page
// is opened, so there's nothing to "migrate" or wait on the Vapi side for.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function transcriptText(messages) {
  return (messages || [])
    .map((m) => `${m.role === "assistant" ? "Riley" : "Caller"}: ${m.text}`)
    .join("\n");
}

export async function generateCallSummary(messages) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !messages || messages.length === 0) return null;

  const prompt = `You are summarizing a phone call for a sales rep who has no time to read the full transcript. The call is between Riley, an AI voice agent for Caldarium (a prior-authorization documentation platform for healthcare provider teams), and a prospect.

Write the summary in 2-3 plain sentences covering: who you're speaking with and their role/organization if mentioned, what they said about their prior-auth workflow or pain points, any objections or hesitations, and the agreed next step. Plain prose only — no markdown, no bullet points, no headers, no asterisks. If the caller declined to engage, wasn't interested, or ended the call early, say that plainly in one sentence instead of padding it out.

Transcript:
${transcriptText(messages).slice(0, 6000)}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const raw = await res.json();
    const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch {
    return null;
  }
}
