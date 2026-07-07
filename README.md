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

## Migrating off deprecated Vapi analysisPlan (Summary + Structured Data)

Vapi has deprecated `analysisPlan.summaryPrompt` **and**
`analysisPlan.structuredDataPrompt`/`structuredDataSchema` in favor of the
newer **Structured Outputs** system (schema-based, attached to the assistant
via `artifactPlan.structuredOutputIds`, results land in
`call.artifact.structuredOutputs` instead of `call.analysis.*`).

`lib/vapi-analysis.js` reads **both** locations so nothing breaks mid-migration:
calls already analyzed keep showing their legacy `analysis.summary` /
`analysis.structuredData`; once you link the new Structured Outputs below to
Riley, new calls automatically use those instead — no further dashboard
change needed. Matching is by shape (a `summary` string field, or an object
with `contact`/`qualification`/`follow_up`/`prior_auth`/`intent`/`outcome`),
not by a hardcoded output ID, so you can name these whatever you like.

### 1. Create a "Call Summary" structured output

```bash
curl -X POST https://api.vapi.ai/structured-output \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Call Summary",
    "type": "ai",
    "description": "Plain-language summary for a sales rep skimming a lead list",
    "schema": {
      "type": "object",
      "properties": {
        "summary": {
          "type": "string",
          "description": "2-3 plain sentences: who called and their role/org if mentioned, what they said about their prior-auth workflow or pain points, any objections, and the agreed next step. No markdown, no bullet points, no headers. If they declined to engage or ended the call early, say so in one sentence."
        }
      },
      "required": ["summary"]
    }
  }'
```

### 2. Create a "Lead Data" structured output (replaces the old structuredDataSchema)

```bash
curl -X POST https://api.vapi.ai/structured-output \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lead Data",
    "type": "ai",
    "description": "Prior-auth lead qualification data extracted from the call",
    "schema": {
      "type": "object",
      "properties": {
        "contact": {
          "type": "object",
          "properties": {
            "full_name": { "type": "string" },
            "role_title": { "type": "string" },
            "organization": { "type": "string" },
            "phone": { "type": "string" },
            "email": { "type": "string", "format": "email" }
          }
        },
        "intent": { "type": "string", "enum": ["research", "sales_interest", "support", "scheduling", "other"] },
        "outcome": { "type": "string", "enum": ["connected", "left_voicemail", "no_answer", "not_interested", "call_back_requested", "meeting_scheduled", "other"] },
        "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] },
        "prior_auth": {
          "type": "object",
          "properties": {
            "pain_points": { "type": "array", "items": { "type": "string" } },
            "tools_systems": { "type": "array", "items": { "type": "string" } },
            "denials_rework_level": { "type": "string", "enum": ["high", "medium", "low", "unknown"] }
          }
        },
        "qualification": {
          "type": "object",
          "properties": {
            "urgency": { "type": "string", "enum": ["high", "medium", "low"] },
            "is_good_fit": { "type": "boolean" },
            "reason": { "type": "string" }
          }
        },
        "follow_up": {
          "type": "object",
          "properties": {
            "needs_follow_up": { "type": "boolean" },
            "next_step": { "type": "string" },
            "follow_up_timeframe": { "type": "string", "enum": ["immediate", "within_week", "within_month", "unknown"] },
            "scheduled_time_iso": { "type": "string", "format": "date-time" }
          }
        }
      }
    }
  }'
```

Double-check the enum values above against whatever your original
`structuredDataSchema` actually used before it was deprecated — these were
reconstructed from what the dashboard reads, so confirm against Vapi's
dashboard (or a past call's `analysis.structuredData`) if you still have
access to view it.

### 3. Link both to Riley

Both curl responses return an `id`. Add both to Riley's assistant:

```bash
curl -X PATCH https://api.vapi.ai/assistant/<RILEY_ASSISTANT_ID> \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "artifactPlan": {
      "structuredOutputIds": ["<summary-output-id>", "<lead-data-output-id>"]
    }
  }'
```

(If Riley's `artifactPlan` already has other settings, fetch the assistant
first and merge — this PATCH body should only add `structuredOutputIds`, not
wipe out existing artifact settings.)

## Supabase archive (everything Vapi exposes)

Every Vapi resource the account has access to — Calls, Assistants (with
version history), Phone Numbers, Tools, Squads, Files, Chats, Sessions,
Evals + Eval Runs, and a daily Analytics snapshot — is mirrored into a
Supabase Postgres project called "Voice Agent Data". Each table keeps a
`raw jsonb` column with the untouched Vapi object plus a few normalized
columns for fast queries, so nothing Vapi returns is ever lost even if the
dashboard doesn't have a UI for it yet.

### Why

- Vapi's own `/call` list endpoint is capped (`VAPI_FETCH_LIMIT`, default
  200). Supabase accumulates the full history forever — see the "All-time
  archive" panel on the Overview page, which reads straight from Supabase.
- If Vapi ever changes or removes data (retention limits, plan changes,
  deprecated fields), the Supabase copy is unaffected.
- It's a durable base for future reporting/BI without hitting Vapi's API
  every time.

### How it syncs

- **Calls** — dual-write. Every time the dashboard polls `/api/calls` or a
  user opens a call's detail page (`/api/calls/[id]`), that data is
  upserted into `vapi_calls` in the same request (best-effort; a Supabase
  hiccup never breaks the live dashboard).
- **Everything else** (Assistants, Phone Numbers, Tools, Squads, Files,
  Chats, Sessions, Evals, Analytics) — nothing in the dashboard currently
  polls these, so they sync via `GET /api/sync`, meant to be triggered by
  Vercel Cron (see `vercel.json` — daily at 06:00 UTC). This same route also
  runs a bounded backfill pass (40 calls per run) that fetches full
  transcript/messages for any call that's only ever been partially synced
  (i.e. never opened in the dashboard), so full history accumulates over a
  few days even for calls nobody clicked into.
- All sync activity (success and failure, per resource) is logged to
  `vapi_sync_log` for observability.

### One-time setup

1. In Supabase, the schema (13 tables) has already been created via the
   Management API against project ref `bffybujjggargsjhxuhh` ("Voice Agent
   Data"). Nothing to do here unless you want to inspect it (Supabase
   dashboard → Table Editor).
2. Add these environment variables in Vercel (Project → Settings →
   Environment Variables) and redeploy:

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | `https://bffybujjggargsjhxuhh.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | the project's `service_role` key (Supabase dashboard → Settings → API) |
   | `CRON_SECRET` | any random string you generate — Vercel automatically sends it as `Authorization: Bearer <value>` when it triggers `/api/sync` via the cron in `vercel.json`, and this route checks that header |

   The service_role key bypasses row-level security — it's only ever read
   server-side (`lib/supabase.js`), never sent to the browser.

3. Trigger the first sync manually to backfill history (don't wait for the
   daily cron):

   ```bash
   curl "https://<your-deployment>/api/sync" -H "Authorization: Bearer <CRON_SECRET>"
   ```

   Run it a few times (or wait a few days for the daily cron) to fully
   backfill transcripts for older calls — each run only processes 40 calls
   at a time to stay within the serverless function's time limit.
