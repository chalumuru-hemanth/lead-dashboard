# Caldarium Lead Analysis Dashboard

Live dashboard over your Vapi assistant **Riley**'s calls. It reads
`analysis.structuredData` (contact, intent, outcome, sentiment, prior_auth,
qualification, follow_up) from Vapi's `GET /call` API and renders it as a
filterable, groupable board your team can open in a browser.

Your Vapi private key is only ever used server-side (in `app/api/calls/route.js`)
— it's never sent to the browser.

## 1. Run it locally

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste your VAPI_PRIVATE_KEY (Vapi dashboard > Settings > API Keys)
npm run dev
```

Open http://localhost:3000 — you should see Riley's real calls. The page
polls `/api/calls` every 20 seconds and has a manual refresh button.

If you see "Couldn't load calls", check:
- `VAPI_PRIVATE_KEY` is set and correct
- `VAPI_ASSISTANT_ID` matches the assistant you want (defaults to Riley's:
  `63351c83-f19c-4532-90bf-d1a28c2ab35c`) — remove the env var entirely to see
  calls across all your assistants

## 2. Deploy it for your team

Easiest path is Vercel:

```bash
npm i -g vercel
vercel
```

Then in the Vercel project dashboard: **Settings > Environment Variables**,
add `VAPI_PRIVATE_KEY` (and `VAPI_ASSISTANT_ID` if you want it locked to
Riley). Redeploy after adding env vars.

Since this shows real lead/contact data, turn on Vercel's **Password
Protection** or **Vercel Authentication** (Settings > Deployment Protection)
so it isn't publicly reachable — anyone with the URL and no protection could
see your calls.

Netlify, Render, Railway, or your own server all work the same way: it's a
standard Next.js app, just set `VAPI_PRIVATE_KEY` as an environment variable
wherever you host it.

## How it works

- `app/api/calls/route.js` — server route. Calls
  `https://api.vapi.ai/call?assistantId=...&limit=...` with your private key
  in the `Authorization` header, normalizes each call, and returns JSON.
- `app/page.js` — client dashboard. Fetches `/api/calls`, polls it, and
  renders bento stats (calls analyzed, needs follow-up, meetings scheduled,
  high urgency), a filter panel (outcome / urgency / denials-rework /
  follow-up), a group-by switcher, and expandable rows with the call summary,
  pain points, and a link to the recording.
- Calls that don't have `analysis.structuredData` yet (e.g. calls made before
  you enabled the schema, or calls still being analyzed) show a "No
  structured data" tag instead of being hidden, so nothing silently
  disappears.

## Adjusting it

- Poll interval: change `POLL_MS` at the top of `app/page.js` (default
  20000ms).
- How many calls to pull: `VAPI_FETCH_LIMIT` env var (default 200). Vapi's API
  is paginated past that if you have high call volume — ask if you want
  cursor-based pagination added.
- Schema fields: the dashboard expects the exact `structuredDataPlan` schema
  you configured on Riley (contact / intent / prior_auth / qualification /
  follow_up / sentiment / outcome). If you change that schema, update the
  constants at the top of `app/page.js` (`OUTCOME_LABEL`, `OUTCOME_STYLE`,
  `URGENCY_STYLE`) to match.

## Alternative: Vapi's own Boards

Vapi's dashboard has a native "Boards" feature that can read
`analysis.structuredData` with zero code — just invite teammates to your Vapi
org. It's less customizable than this app but requires no deployment at all.
This app is worth it if you want a branded, purpose-built view your whole team
can open without a Vapi login.
