"use client";

import { useMemo, useState } from "react";
import { useEmails } from "../providers";
import {
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  hasReply,
  needsAttention,
  emailContactName,
  extractKeywords,
  timeAgo,
} from "@/lib/constants";

function Badge({ label, color }) {
  return (
    <span className="badge" style={{ color, background: color + "1A" }}>
      <span className="pd" style={{ background: color }} />
      {label}
    </span>
  );
}

function gmailThreadUrl(threadId) {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function toCsv(rows) {
  const headers = ["Name", "Organization", "Status", "Priority", "Summary", "Suggested action", "Sent at", "Replied at"];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  rows.forEach((r) => {
    lines.push(
      [
        emailContactName(r),
        r.organization || "",
        r.status || "",
        PRIORITY_LABEL[r.aiPriority] || "",
        r.aiSummary || "",
        r.aiAction || "",
        r.sentAt || "",
        r.repliedAt || "",
      ]
        .map(escape)
        .join(",")
    );
  });
  return lines.join("\n");
}

function downloadCsv(rows) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caldarium-outreach-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function OutreachPage() {
  const { rows, loading, error, fetchedAt, triaging } = useEmails();
  const [priorityFilter, setPriorityFilter] = useState([]);

  const sent = useMemo(() => rows.filter((r) => r.status), [rows]);
  const replied = useMemo(() => rows.filter(hasReply), [rows]);
  const replyRate = sent.length ? Math.round((replied.length / sent.length) * 100) : 0;
  const attention = useMemo(() => replied.filter(needsAttention), [replied]);

  const triageOrder = { high: 0, medium: 1, low: 2, "": 1 };
  const sortedAttention = useMemo(
    () =>
      [...attention].sort((a, b) => {
        const pa = triageOrder[a.aiPriority] ?? 1;
        const pb = triageOrder[b.aiPriority] ?? 1;
        if (pa !== pb) return pa - pb;
        return new Date(b.repliedAt || 0) - new Date(a.repliedAt || 0);
      }),
    [attention]
  );

  const filtered = useMemo(
    () => (priorityFilter.length ? sortedAttention.filter((r) => priorityFilter.includes(r.aiPriority || "unclassified")) : sortedAttention),
    [sortedAttention, priorityFilter]
  );

  const toggleFilter = (v) => setPriorityFilter((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));

  const keywordData = useMemo(() => {
    const texts = replied.map((r) => r.replySnippet).filter(Boolean);
    return extractKeywords(texts, { max: 16, minCount: 1, minLen: 4 });
  }, [replied]);
  const maxKw = keywordData.length ? keywordData[0].count : 1;
  const kwTier = (n) => (n >= maxKw * 0.7 ? "t1" : n >= maxKw * 0.4 ? "t2" : "t3");

  if (loading && rows.length === 0) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Outreach</h1><p>Cold email replies, triaged automatically.</p></div></div>
        <div className="skel-grid">
          <div className="skel-block" /><div className="skel-block" /><div className="skel-block" /><div className="skel-block" />
        </div>
        <div className="skel-block" style={{ height: 260 }} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head fade-up">
        <div>
          <div className="eyebrow"><span className="dot good" style={{ width: 6, height: 6, borderRadius: "50%" }} />{triaging ? "Triaging…" : "Live"}</div>
          <h1>Outreach</h1>
          <p>Cold email replies, summarized and prioritized automatically — so you know who to answer first, without reading every thread.</p>
        </div>
      </div>

      {error && (
        <div className="notice error"><span>⚠</span><span><b>Couldn&apos;t load outreach data.</b> {error}</span></div>
      )}

      {!error && rows.length > 0 && (
        <div className="kpi-grid stagger">
          <div className="kpi"><div className="k">Contacted</div><div className="v">{sent.length}</div><div className="d">rows with a send/draft status</div></div>
          <div className="kpi"><div className="k">Replied</div><div className="v">{replied.length}</div><div className="d">{replyRate}% reply rate</div></div>
          <div className="kpi"><div className="k">Needs attention</div><div className="v">{attention.length}</div><div className="d">high/medium priority or not yet triaged</div></div>
          <div className="kpi"><div className="k">Synced</div><div className="v" style={{ fontSize: 18 }}>{fetchedAt ? timeAgo(fetchedAt) : "—"}</div><div className="d">auto-refreshes every 30s</div></div>
        </div>
      )}

      <div className="toolbar fade-up">
        <div className="chip-row">
          {["high", "medium", "low"].map((k) => (
            <button key={k} className={`chip${priorityFilter.includes(k) ? " on" : ""}`} onClick={() => toggleFilter(k)}>
              {PRIORITY_LABEL[k]} priority
            </button>
          ))}
          <button className={`chip${priorityFilter.includes("unclassified") ? " on" : ""}`} onClick={() => toggleFilter("unclassified")}>Not yet triaged</button>
        </div>
        <button className="btn" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Export CSV
        </button>
        <span className="result-count">{filtered.length} repl{filtered.length === 1 ? "y" : "ies"}</span>
      </div>

      <div className="card fade-up" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "18px 19px 4px" }}>
          <h3>Needs your reply</h3>
          <div className="sub">Sorted by priority, then most recent</div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: "0 19px 24px" }}>
            {replied.length === 0 ? "No replies yet — nothing to triage." : "Nothing matches these filters."}
          </div>
        ) : (
          <div>
            {filtered.map((r) => (
              <div key={r.threadId || r.email} style={{ padding: "16px 19px", borderTop: "1px solid var(--line)", display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: "0 0 190px" }}>
                  <div className="lead-name">{emailContactName(r)}</div>
                  <div className="lead-sub">{r.organization || "—"}</div>
                  <div className="lead-sub" style={{ marginTop: 6 }}>{r.repliedAt ? timeAgo(r.repliedAt) : "—"}</div>
                </div>
                <div style={{ flex: "0 0 90px" }}>
                  {r.aiPriority ? (
                    <Badge label={PRIORITY_LABEL[r.aiPriority] || r.aiPriority} color={PRIORITY_COLOR[r.aiPriority] || "#5C5F80"} />
                  ) : (
                    <span className="legacy-tag">Triaging…</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink-700)", fontWeight: 600 }}>
                    {r.aiSummary || <span style={{ color: "var(--ink-300)", fontWeight: 500 }}>{(r.replySnippet || "").slice(0, 140) || "No reply text captured."}</span>}
                  </div>
                  {r.aiAction && (
                    <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, marginTop: 6 }}>→ {r.aiAction}</div>
                  )}
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  {r.threadId && (
                    <a href={gmailThreadUrl(r.threadId)} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: 11.5, padding: "6px 12px" }}>
                      Open thread
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card fade-up">
        <h3>Trending in replies</h3>
        <div className="sub">What prospects are actually saying back — mined straight from reply text</div>
        {keywordData.length === 0 ? (
          <div className="empty-inline">Not enough reply text yet to spot trends.</div>
        ) : (
          <div className="kw-cloud">
            {keywordData.map((k, i) => (
              <span className={`kw-chip ${kwTier(k.count)}`} key={k.word} style={{ animationDelay: `${(i % 6) * 0.3}s` }}>
                {k.word} <span className="n">×{k.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
