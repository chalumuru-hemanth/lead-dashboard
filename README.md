# Riley Lead Intelligence Dashboard

Live dashboard over your Vapi assistant **Riley**'s calls: an analytics
overview, a searchable/sortable leads table, and a per-call detail page with
the full transcript (chat-bubble style, synced to the recording) plus every
structured field Riley extracted.

Your Vapi private key is only ever used server-side (`app/api/calls/**`) —
it's never sent to the browser.

## 1. Run it locally

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste your VAPI_PRIVATE_KEY (Vapi dashboard > Settings > API Keys)
npm run dev
```

Open http://localhost:3000. The dashboard polls `/api/calls` every 20 seconds
and has a manual refresh button in the sidebar.

If you see "Couldn't load calls", check:
- `VAPI_PRIVATE_KEY` is set and correct
- `VAPI_ASSISTANT_ID` matches the assistant you want (defaults to Riley's:
  `63351c83-f19c-4532-90bf-d1a28c2ab35c`) — remove the env var entirely to see
  calls across all your assistants

## 2. Deploy it for your team

This repo is set up to auto-deploy on Vercel via GitHub — push to `main` and
Vercel rebuilds automatically. First-time setup: on vercel.com, add
`VAPI_PRIVATE_KEY` (and optionally `VAPI_ASSISTANT_ID`) under **Settings >
Environment Variables**, then redeploy.

Since this shows real lead/contact data, turn on Vercel's **Password
Protection** or **Vercel Authentication** (Settings > Deployment Protection)
so it isn't publicly reachable.

## Pages

- **Overview** (`/`) — KPIs (total calls, needs follow-up, meetings scheduled,
  avg call length), a 14-day call volume trend, an outcomes donut, urgency and
  sentiment breakdowns, a ranked list of the most common pain points across
  all calls, a "hot leads" callout for calls that are both high urgency *and*
  high denials/rework, and a quick list of the most recent leads needing
  follow-up.
- **Leads** (`/leads`) — every call as a sortable, searchable, filterable
  table (by outcome, urgency, follow-up status). Click a row to open the
  detail page.
- **Lead detail** (`/leads/[id]`) — contact card, qualification, prior-auth
  pain points/tools, follow-up plan, and Riley's summary on the left; the full
  call transcript on the right, with an embedded audio player and a
  transcript search box. Click any transcript line to jump the recording to
  that moment.

## How it works

- `app/api/calls/route.js` — lightweight list endpoint (no transcript, to
  keep the Overview/Leads pages fast). Calls
  `https://api.vapi.ai/call?assistantId=...&limit=...` server-side.
- `app/api/calls/[id]/route.js` — single-call endpoint used by the detail
  page. Calls `https://api.vapi.ai/call/{id}` and includes the full
  transcript, turn-by-turn messages, and recording URL.
- `app/providers.js` — a React context (`CallsProvider`/`useCalls`) that
  fetches and polls the list endpoint once, shared by the Overview and Leads
  pages.
- `lib/constants.js` — shared labels/colors/helpers (outcome, urgency,
  sentiment, formatting). Edit this file if you change Riley's
  `structuredDataPlan` schema.
- Calls without `analysis.structuredData` yet (e.g. calls made before the
  schema was enabled) show a "No structured data" tag instead of being
  hidden, so nothing silently disappears.

## Adjusting it

- Poll interval: `POLL_MS` in `app/providers.js` (default 20000ms).
- How many calls to pull: `VAPI_FETCH_LIMIT` env var (default 200).
- Charts: built with [Recharts](https://recharts.org) in `app/page.js` — a
## Outreach (email triage) — new section

A fourth page, **Outreach** (`/outreach`), shows replies to the Gmail cold-email
campaign (the Apps Script in `google-apps-script/`), automatically summarized
and prioritized by Gemini so a human doesn't have to read every thread to know
what needs a response.

### How it fits together

1. `google-apps-script/outreach.gs.js` — the existing mail-merge/automation
   script (unchanged), bound to the Contacts sheet.
2. `google-apps-script/dashboard-bridge.gs.js` — **new**, paste into the same
   Apps Script project. Adds a Web App endpoint: `GET` returns every contact
   row plus the latest reply snippet per thread; `POST` writes AI triage
   results back into the Sheet (`AIPriority`/`AISummary`/`AIAction`/
   `AIProcessedAt` columns, created automatically) so the same reply is never
   re-classified twice.
3. `app/api/emails/route.js` — server route the dashboard polls; proxies the
   Web App above.
4. `app/api/emails/triage/route.js` — server route that batches any
   un-triaged replies to Gemini (`gemini-2.5-flash` by default) for a
   priority (`high`/`medium`/`low`), one-line summary, and a suggested next
   step, then writes the results back to the Sheet via the bridge.
5. `app/providers.js` (`EmailsProvider`) — polls `/api/emails` every 30s and
   automatically calls the triage route for anything new, merging results in
   immediately.

### One-time setup

1. In the Contacts sheet: **Extensions > Apps Script**, add
   `dashboard-bridge.gs.js` as a new file in the same project as the existing
   outreach script.
2. Edit the `SECRET` constant in `setDashboardSecret_()` to a long random
   string, then run that function once from the Apps Script editor (Run menu
   > select the function > Run). Authorize when prompted.
3. **Deploy > New deployment > Web app.** Execute as **Me**, who has access
   **Anyone**. Deploy, copy the Web app URL.
4. In Vercel (Project Settings > Environment Variables), add:
   - `OUTREACH_WEBAPP_URL` — the Web app URL from step 3
   - `OUTREACH_SECRET` — the same secret from step 2
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
   - `GEMINI_MODEL` — optional, defaults to `gemini-2.5-flash`
5. Redeploy.

The Sheet doubles as the durable log/cache — anyone can open it and see the
same `AIPriority`/`AISummary`/`AIAction` columns the dashboard reads.
