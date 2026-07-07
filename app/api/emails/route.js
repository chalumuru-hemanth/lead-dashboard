// Proxies the Apps Script "dashboard bridge" Web App (see
// google-apps-script/dashboard-bridge.gs.js). Returns every contact row plus
// the latest reply snippet per thread, including any cached AI triage
// (priority/summary/action) already written back to the Sheet.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.OUTREACH_WEBAPP_URL;
  const secret = process.env.OUTREACH_SECRET;

  if (!url || !secret) {
    return Response.json(
      {
        error:
          "OUTREACH_WEBAPP_URL / OUTREACH_SECRET are not set. Deploy the Apps Script bridge (see google-apps-script/dashboard-bridge.gs.js) and add both env vars, then redeploy.",
      },
      { status: 500 }
    );
  }

  let res;
  try {
    res = await fetch(`${url}?secret=${encodeURIComponent(secret)}`, { cache: "no-store" });
  } catch (err) {
    return Response.json({ error: `Failed to reach the outreach script: ${err.message}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ error: `Outreach script responded ${res.status}: ${text || res.statusText}` }, { status: res.status });
  }

  const raw = await res.json();
  if (raw.error) {
    return Response.json({ error: raw.error }, { status: 500 });
  }

  return Response.json({ rows: raw.rows || [], fetchedAt: raw.fetchedAt || new Date().toISOString() });
}
