/**
 * Caldarium outreach — Dashboard bridge (paste into the SAME Apps Script
 * project as Code.gs, i.e. Extensions > Apps Script in the Contacts sheet).
 * --------------------------------------------------------------------------
 * Exposes a Web App endpoint the lead-dashboard (Next.js/Vercel) calls to:
 *   - GET  -> read every contact row + the latest reply snippet per thread
 *   - POST -> write back AI-generated priority/summary/suggested-action so
 *             the dashboard doesn't have to re-classify the same reply on
 *             every refresh (the Sheet becomes the cache).
 *
 * ONE-TIME SETUP
 *  1) Paste this whole file as a new script file in the same Apps Script
 *     project as the outreach script (Contacts sheet already has it bound).
 *  2) Edit SECRET below to a long random string (a suggested one has been
 *     generated for you separately — use that, don't reuse it anywhere else).
 *  3) Run `setDashboardSecret_` once from the Apps Script editor (select it
 *     in the function dropdown, click Run). Authorize when prompted.
 *  4) Deploy > New deployment > type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     Deploy, then copy the Web app URL.
 *  5) In Vercel (Project Settings > Environment Variables) set:
 *       OUTREACH_WEBAPP_URL = <the Web app URL from step 4>
 *       OUTREACH_SECRET     = <the same secret you put in step 2>
 *     then redeploy.
 *
 * The secret is required on every request (?secret=...) because a Web App
 * set to "Anyone" has no other auth — anyone with the URL AND the secret can
 * read contact data, so keep the secret out of any public repo/chat.
 */

function setDashboardSecret_() {
  const SECRET = 'PASTE_YOUR_OWN_LONG_RANDOM_SECRET_HERE';
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_SECRET', SECRET);
  Logger.log('Dashboard secret saved. Set the same value as OUTREACH_SECRET in Vercel.');
}

// Columns the AI triage results are cached into (created automatically).
const AI_COLS = {
  priority: 'AIPriority',        // "high" | "medium" | "low"
  summary: 'AISummary',          // one-sentence summary of the reply
  action: 'AIAction',            // suggested next step for the sales rep
  processedAt: 'AIProcessedAt',  // when this row was last classified
};

function checkSecret_(e) {
  const want = PropertiesService.getScriptProperties().getProperty('DASHBOARD_SECRET');
  const got = e && e.parameter && e.parameter.secret;
  return !!want && got === want;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (!checkSecret_(e)) return jsonOut_({ error: 'unauthorized' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return jsonOut_({ error: 'No "' + CONFIG.SHEET_NAME + '" tab' });

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonOut_({ rows: [], fetchedAt: new Date().toISOString() });

  const headers = data[0].map(function (h) { return String(h).trim(); });
  const col = indexMap_(headers);
  const me = (CONFIG.SENDER_EMAIL || Session.getActiveUser().getEmail()).toLowerCase();

  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const email = String(row[col[COLS.email]] || '').trim();
    if (!email) continue;

    const threadId = col[COLS.threadId] !== undefined ? String(row[col[COLS.threadId]] || '').trim() : '';
    let replySnippet = '';
    let replySubject = '';
    if (threadId) {
      try {
        const thread = GmailApp.getThreadById(threadId);
        if (thread) {
          const msgs = thread.getMessages();
          for (let m = msgs.length - 1; m >= 0; m--) {
            const from = String(msgs[m].getFrom() || '').toLowerCase();
            if (from.indexOf(me) === -1) {
              replySnippet = msgs[m].getPlainBody().slice(0, 1200);
              replySubject = msgs[m].getSubject() || '';
              break;
            }
          }
        }
      } catch (err) { /* thread may be gone — skip */ }
    }

    rows.push({
      email: email,
      firstName: col[COLS.firstName] !== undefined ? String(row[col[COLS.firstName]] || '') : '',
      organization: col[COLS.organization] !== undefined ? String(row[col[COLS.organization]] || '') : '',
      status: col[COLS.status] !== undefined ? String(row[col[COLS.status]] || '') : '',
      sentAt: col[COLS.sentAt] !== undefined ? row[col[COLS.sentAt]] : '',
      repliedAt: col[COLS.repliedAt] !== undefined ? row[col[COLS.repliedAt]] : '',
      threadId: threadId,
      replySnippet: replySnippet,
      replySubject: replySubject,
      aiPriority: col[AI_COLS.priority] !== undefined ? String(row[col[AI_COLS.priority]] || '') : '',
      aiSummary: col[AI_COLS.summary] !== undefined ? String(row[col[AI_COLS.summary]] || '') : '',
      aiAction: col[AI_COLS.action] !== undefined ? String(row[col[AI_COLS.action]] || '') : '',
      aiProcessedAt: col[AI_COLS.processedAt] !== undefined ? row[col[AI_COLS.processedAt]] : '',
    });
  }

  return jsonOut_({ rows: rows, fetchedAt: new Date().toISOString() });
}

function doPost(e) {
  if (!checkSecret_(e)) return jsonOut_({ error: 'unauthorized' });

  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut_({ error: 'bad json' }); }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return jsonOut_({ updated: 0 });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim(); });
  resolveAiColumns_(sheet, headers);
  const refreshed = sheet.getDataRange().getValues();
  const col = indexMap_(refreshed[0].map(function (h) { return String(h).trim(); }));

  let updated = 0;
  items.forEach(function (item) {
    const rIdx0 = findRowByThreadId_(refreshed, col, item.threadId);
    if (rIdx0 === -1) return;
    if (item.priority !== undefined) setCell_(sheet, rIdx0, col[AI_COLS.priority], item.priority);
    if (item.summary !== undefined) setCell_(sheet, rIdx0, col[AI_COLS.summary], item.summary);
    if (item.action !== undefined) setCell_(sheet, rIdx0, col[AI_COLS.action], item.action);
    setCell_(sheet, rIdx0, col[AI_COLS.processedAt], new Date());
    updated++;
  });

  return jsonOut_({ updated: updated });
}

function findRowByThreadId_(data, col, threadId) {
  if (col[COLS.threadId] === undefined || !threadId) return -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][col[COLS.threadId]] || '').trim() === String(threadId).trim()) return r;
  }
  return -1;
}

function resolveAiColumns_(sheet, headers) {
  const needed = [AI_COLS.priority, AI_COLS.summary, AI_COLS.action, AI_COLS.processedAt];
  let lastCol = sheet.getLastColumn();
  needed.forEach(function (name) {
    if (headers.indexOf(name) === -1) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(name).setFontWeight('bold');
      headers.push(name);
    }
  });
}
