/**
 * Caldarium outreach — Gmail mail merge + daily automation + reply tracking
 * --------------------------------------------------------------------------
 * Bound to a Google Sheet. Reads a "Contacts" tab, sends a personalized email
 * per row using merge fields, and tracks who was emailed and who replied.
 *
 * THREE WAYS TO RUN (all from the "Caldarium" menu in the Sheet):
 *   - Create drafts (no send)   -> review before anything goes out
 *   - Send emails now           -> manual send of the next batch
 *   - Turn ON daily automation  -> Google sends a batch every day on its own
 *
 * First-time use: run "Create drafts" once, review in Gmail, then turn on automation.
 *
 * NOTE: this file is kept here for version control / team visibility only —
 * the live copy lives in Extensions > Apps Script on the Contacts sheet.
 * dashboard-bridge.gs.js in this same folder is an ADDITIONAL file that goes
 * in that same Apps Script project.
 */

// ======================= CONFIG — EDIT THESE =======================
const CONFIG = {
  SHEET_NAME: 'Contacts',

  // Your sender identity (used in the signature).
  SENDER_NAME: 'Kevin',
  SENDER_TITLE: 'Founder',
  SENDER_EMAIL: 'chalumuruhemanth@gmail.com',   // address you send from / want replies to

  // Caldarium prior-auth feedback form (public responder link):
  FORM_LINK: 'https://docs.google.com/forms/d/e/1FAIpQLScnLY-rfZAiQN3TIoayuSCUkPg2CvZ-bAqqlcSl6t4E6i4XLw/viewform',

  // How many emails to SEND per calendar day (across all runs + automation).
  // Personal Gmail caps ~100/day; Workspace ~1500/day. Stay safely under.
  DAILY_SEND_LIMIT: 40,

  // Hour of day (0-23, your script timezone) the daily automation runs.
  AUTO_SEND_HOUR: 9,

  // Gmail labels (created automatically).
  LABEL_SENT: 'Caldarium/Outreach',
  LABEL_REPLIED: 'Caldarium/Replied',

  // Subject line. {{ }} merge fields are filled per row.
  SUBJECT: 'Caldarium — helping provider teams prevent documentation-driven prior auth denials',
};
// ===================================================================

// Headers expected in row 1 of the Contacts tab.
// Left = key used by the script; right = the header text in your sheet (edit to match).
const COLS = {
  email:        'Email',
  firstName:    'FirstName',
  organization: 'Organization',
  // Tracking columns (created automatically if missing):
  status:       'Status',
  sentAt:       'SentAt',
  repliedAt:    'RepliedAt',
  threadId:     'ThreadId',
};

// The professional email body. Keep {{merge fields}} intact.
const BODY_TEMPLATE =
`Dear {{FirstName}},

I'm reaching out to introduce Caldarium, a documentation-readiness platform built for the teams responsible for prior authorization and reimbursement.

Caldarium addresses a problem most provider organizations know well: a large share of prior auth denials stem not from the clinical decision, but from documentation that is incomplete, fragmented, or misaligned with what the payer requires. These failures are predictable — and preventable.

Here is what the platform does and how it can help your team. Caldarium reviews clinical documentation against each payer's specific requirements before a case is submitted, surfaces the evidence that is missing or insufficient, and helps your staff prepare a stronger, better-organized submission. In practice, that means fewer avoidable denials, less rework and resubmission, faster authorization turnaround, and protected revenue — with your team in control of every decision, since the platform supports human review at each step rather than replacing clinical judgment.

As prior authorization moves toward electronic, FHIR-based workflows under CMS 0057, documentation quality is becoming the limiting factor. Caldarium is designed to help teams meet that bar today and as the standards evolve.

We are developing the platform alongside the people who manage this work every day, and your perspective would be valuable. If you have about 5 minutes, I'd be grateful if you would complete this short form so we can better understand the challenges your team faces:

{{FormLink}}

Thank you for your time, and for the work you do in a demanding area of healthcare operations.

Sincerely,
{{SenderName}}
{{SenderTitle}}, Caldarium
caldarium.org`;


// ======================= MENU =======================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Caldarium')
    .addItem('1. Create drafts (no send)', 'createDrafts')
    .addItem('2. Send emails now', 'sendEmails')
    .addSeparator()
    .addItem('Turn ON daily automation', 'installAutomation')
    .addItem('Turn OFF daily automation', 'removeAutomation')
    .addSeparator()
    .addItem('Check for replies', 'checkReplies')
    .addItem('Show today’s send count', 'showSendCount')
    .addToUi();
}

function createDrafts() { run_(false, true); }
function sendEmails()  { run_(true, true); }


// ======================= AUTOMATION =======================
function installAutomation() {
  removeAutomation_();
  ScriptApp.newTrigger('dailyAutoSend')
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.AUTO_SEND_HOUR)
    .create();
  alert_('Daily automation is ON.\n\nEach day around ' + CONFIG.AUTO_SEND_HOUR +
         ':00 it will send up to ' + CONFIG.DAILY_SEND_LIMIT +
         ' new emails and check for replies — automatically.\n\nUse "Turn OFF daily automation" to stop.');
}

function removeAutomation() {
  removeAutomation_();
  alert_('Daily automation is OFF. No more automatic sends.');
}

function removeAutomation_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyAutoSend') { ScriptApp.deleteTrigger(t); }
  });
}

function dailyAutoSend() {
  run_(true, false);
  checkReplies_(false);
}


// ======================= CORE =======================
function run_(doSend, showUi) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { log_('No tab named "' + CONFIG.SHEET_NAME + '".', showUi); return; }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) { log_('No contact rows found.', showUi); return; }

  const headers = data[0].map(function (h) { return String(h).trim(); });
  resolveColumns_(sheet, headers);
  const refreshed = sheet.getDataRange().getValues();
  const col = indexMap_(refreshed[0].map(function (h) { return String(h).trim(); }));

  const sentLabel = getOrCreateLabel_(CONFIG.LABEL_SENT);

  let sentToday = getSentToday_();
  let processed = 0, skipped = 0, stopped = false;

  for (let r = 1; r < refreshed.length; r++) {
    const row = refreshed[r];
    const email = String(row[col[COLS.email]] || '').trim();
    if (!email) { continue; }
    if (!isValidEmail_(email)) { setCell_(sheet, r, col[COLS.status], 'Bad email'); skipped++; continue; }

    const status = String(row[col[COLS.status]] || '').trim().toLowerCase();
    if (status === 'sent' || status === 'draft' || status === 'replied') { skipped++; continue; }

    if (doSend && sentToday >= CONFIG.DAILY_SEND_LIMIT) { stopped = true; break; }

    const fields = buildFields_(row, col);
    const subject = fillTemplate_(CONFIG.SUBJECT, fields);
    const plainBody = fillTemplate_(BODY_TEMPLATE, fields);
    const htmlBody = plainBody.replace(/\n/g, '<br>');

    try {
      const draft = GmailApp.createDraft(email, subject, plainBody, {
        name: CONFIG.SENDER_NAME,
        htmlBody: htmlBody,
        replyTo: CONFIG.SENDER_EMAIL,
      });

      let thread;
      if (doSend) {
        const msg = draft.send();
        thread = msg.getThread();
        thread.addLabel(sentLabel);
        setCell_(sheet, r, col[COLS.status], 'Sent');
        sentToday++;
        incrementSentToday_();
      } else {
        thread = draft.getMessage().getThread();
        setCell_(sheet, r, col[COLS.status], 'Draft');
      }
      setCell_(sheet, r, col[COLS.sentAt], new Date());
      setCell_(sheet, r, col[COLS.threadId], thread.getId());
      processed++;
      Utilities.sleep(400);
    } catch (e) {
      setCell_(sheet, r, col[COLS.status], 'Error: ' + e.message);
      skipped++;
    }
  }

  const verb = doSend ? 'Sent' : 'Drafted';
  let msg = verb + ' ' + processed + ' email(s). Skipped ' + skipped + '.';
  if (stopped) { msg += ' Stopped at the daily send limit (' + CONFIG.DAILY_SEND_LIMIT + ').'; }
  if (!doSend) { msg += ' Review drafts in Gmail, then send.'; }
  log_(msg, showUi);
}


// ======================= REPLY TRACKING =======================
function checkReplies() { checkReplies_(true); }

function checkReplies_(showUi) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { log_('No tab named "' + CONFIG.SHEET_NAME + '".', showUi); return; }

  const data = sheet.getDataRange().getValues();
  const col = indexMap_(data[0].map(function (h) { return String(h).trim(); }));
  if (col[COLS.threadId] === undefined) { log_('No ThreadId column yet — send or draft first.', showUi); return; }

  const repliedLabel = getOrCreateLabel_(CONFIG.LABEL_REPLIED);
  const me = (CONFIG.SENDER_EMAIL || Session.getActiveUser().getEmail()).toLowerCase();
  let newReplies = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const status = String(row[col[COLS.status]] || '').trim().toLowerCase();
    const threadId = String(row[col[COLS.threadId]] || '').trim();
    if (!threadId || status === 'replied') { continue; }

    let thread;
    try { thread = GmailApp.getThreadById(threadId); } catch (e) { continue; }
    if (!thread) { continue; }

    const messages = thread.getMessages();
    let repliedAt = null;
    for (let m = 0; m < messages.length; m++) {
      const from = String(messages[m].getFrom() || '').toLowerCase();
      if (from.indexOf(me) === -1) { repliedAt = messages[m].getDate(); break; }
    }
    if (repliedAt) {
      setCell_(sheet, r, col[COLS.status], 'Replied');
      setCell_(sheet, r, col[COLS.repliedAt], repliedAt);
      thread.addLabel(repliedLabel);
      newReplies++;
    }
  }
  log_('Reply check complete. ' + newReplies + ' new repl(y/ies) found.', showUi);
}


// ======================= HELPERS =======================
function buildFields_(row, col) {
  const first = String(row[col[COLS.firstName]] || '').trim();
  const org = col[COLS.organization] !== undefined ? String(row[col[COLS.organization]] || '').trim() : '';
  return {
    FirstName: first || 'there',
    Organization: org || 'your organization',
    FormLink: CONFIG.FORM_LINK,
    SenderName: CONFIG.SENDER_NAME,
    SenderTitle: CONFIG.SENDER_TITLE,
    SenderEmail: CONFIG.SENDER_EMAIL,
  };
}

function fillTemplate_(tmpl, fields) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, function (match, key) {
    return (fields[key] !== undefined && fields[key] !== null) ? String(fields[key]) : '';
  });
}

function resolveColumns_(sheet, headers) {
  const needed = [COLS.status, COLS.sentAt, COLS.repliedAt, COLS.threadId];
  let lastCol = sheet.getLastColumn();
  needed.forEach(function (name) {
    if (headers.indexOf(name) === -1) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(name).setFontWeight('bold');
      headers.push(name);
    }
  });
}

function indexMap_(headers) {
  const map = {};
  headers.forEach(function (h, i) { map[h] = i; });
  return map;
}

function setCell_(sheet, rowIdx0, colIdx0, value) {
  if (colIdx0 === undefined) { return; }
  sheet.getRange(rowIdx0 + 1, colIdx0 + 1).setValue(value);
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function isValidEmail_(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function todayKey_() {
  return 'sent_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function getSentToday_() {
  const v = PropertiesService.getScriptProperties().getProperty(todayKey_());
  return v ? parseInt(v, 10) : 0;
}
function incrementSentToday_() {
  PropertiesService.getScriptProperties().setProperty(todayKey_(), String(getSentToday_() + 1));
}
function showSendCount() {
  alert_('Sent today: ' + getSentToday_() + ' / ' + CONFIG.DAILY_SEND_LIMIT);
}

function log_(msg, showUi) {
  if (showUi) { alert_(msg); } else { Logger.log(msg); }
}
function alert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}
