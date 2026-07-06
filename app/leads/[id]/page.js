"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  OUTCOME_LABEL,
  OUTCOME_COLOR,
  URGENCY_LABEL,
  URGENCY_COLOR,
  SENTIMENT_LABEL,
  SENTIMENT_COLOR,
  urgency,
  rework,
  contactName,
  fmtDuration,
  fmtDateTime,
  extractKeywords,
} from "@/lib/constants";

function Badge({ label, color }) {
  return (
    <span className="badge" style={{ color, background: color + "1A" }}>
      <span className="pd" style={{ background: color }} />
      {label}
    </span>
  );
}

// Manual transcript-search highlighting (takes priority when the box has text).
function highlightSearch(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// Auto keyword highlighting — surfaces the words actually coming out of the
// caller's mouth (their own most-repeated terms) inline, without needing a
// manual search. Only applied to caller ("user") bubbles.
function highlightKeywords(text, words) {
  if (!words || words.length === 0) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return text;
  const lower = new Set(words.map((w) => w.toLowerCase()));
  return parts.map((part, i) =>
    lower.has(part.toLowerCase()) ? (
      <span className="kw" key={i}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tSearch, setTSearch] = useState("");
  const audioRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/calls/${id}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) setError(data.error || `Request failed (${res.status})`);
        else { setCall(data.call); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const messages = call?.messages || [];

  // Mined live from this call's own caller turns — "any word coming out of
  // the person talking on the other end", ranked by how often they said it.
  const callerKeywords = useMemo(() => {
    const callerTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
    return extractKeywords(callerTexts, { max: 10, minCount: 1, minLen: 4 });
  }, [messages]);
  const callerKeywordWords = useMemo(() => callerKeywords.map((k) => k.word), [callerKeywords]);

  const visibleMessages = useMemo(() => {
    if (!tSearch.trim()) return messages;
    const q = tSearch.trim().toLowerCase();
    return messages.filter((m) => m.text.toLowerCase().includes(q));
  }, [messages, tSearch]);

  const seek = (m) => {
    if (audioRef.current && typeof m.secondsFromStart === "number") {
      audioRef.current.currentTime = m.secondsFromStart;
      audioRef.current.play().catch(() => {});
    }
  };

  if (loading) {
    return <div className="page"><div className="skel-block" style={{ height: 460 }} /></div>;
  }
  if (error) {
    return (
      <div className="page">
        <Link href="/leads" className="back-link">← Back to leads</Link>
        <div className="notice error"><span>⚠</span><span><b>Couldn&apos;t load this call.</b> {error}</span></div>
      </div>
    );
  }
  if (!call) return null;

  const u = urgency(call);
  const r = rework(call);

  return (
    <div className="page">
      <Link href="/leads" className="back-link">← Back to leads</Link>

      <div className="detail-head fade-up">
        <div>
          <div className="detail-title">{contactName(call)}</div>
          <div className="detail-sub">
            {call.contact?.role_title || "Role unknown"}
            {call.contact?.organization && call.contact.organization !== "—" ? ` · ${call.contact.organization}` : ""}
            {" · "}{fmtDateTime(call.createdAt)}
          </div>
          <div className="badge-row">
            {call.outcome && <Badge label={OUTCOME_LABEL[call.outcome] || call.outcome} color={OUTCOME_COLOR[call.outcome] || "#94A3B8"} />}
            {call.qualification && <Badge label={`${URGENCY_LABEL[u]} urgency`} color={URGENCY_COLOR[u]} />}
            {call.sentiment && <Badge label={SENTIMENT_LABEL[call.sentiment] || call.sentiment} color={SENTIMENT_COLOR[call.sentiment] || "#94A3B8"} />}
            {!call.hasStructuredData && <span className="legacy-tag">No structured data</span>}
          </div>
        </div>
        <div className="detail-meta">
          <div className="m"><div className="k">Duration</div><div className="v">{fmtDuration(call.durationSeconds)}</div></div>
          <div className="m"><div className="k">Cost</div><div className="v">{call.cost != null ? `$${call.cost.toFixed(2)}` : "—"}</div></div>
          <div className="m"><div className="k">Ended</div><div className="v" style={{ fontSize: 12.5 }}>{(call.endedReason || "—").replace(/-/g, " ")}</div></div>
        </div>
      </div>

      <div className="detail-grid fade-up">
        <div>
          {callerKeywords.length > 0 && (
            <div className="info-card">
              <h4>Key terms from this caller</h4>
              <div className="kt-wrap">
                {callerKeywords.map((k) => (
                  <span className="kt-chip" key={k.word}>{k.word}{k.count > 1 && <span className="n">×{k.count}</span>}</span>
                ))}
              </div>
            </div>
          )}

          <div className="info-card">
            <h4>Contact</h4>
            <div className="info-row"><dt>Name</dt><dd>{call.contact?.full_name || "—"}</dd></div>
            <div className="info-row"><dt>Role</dt><dd>{call.contact?.role_title || "—"}</dd></div>
            <div className="info-row"><dt>Organization</dt><dd>{call.contact?.organization && call.contact.organization !== "—" ? call.contact.organization : "—"}</dd></div>
            <div className="info-row"><dt>Phone</dt><dd>{call.contact?.phone && call.contact.phone !== "—" ? call.contact.phone : "—"}</dd></div>
            <div className="info-row"><dt>Email</dt><dd>{call.contact?.email && call.contact.email !== "—" ? call.contact.email : "—"}</dd></div>
          </div>

          <div className="info-card">
            <h4>Qualification</h4>
            <div className="info-row"><dt>Intent</dt><dd>{call.intent ? call.intent.replace("_", " ") : "—"}</dd></div>
            <div className="info-row"><dt>Good fit</dt><dd>{call.qualification?.is_good_fit === true ? "Yes" : call.qualification?.is_good_fit === false ? "No" : "—"}</dd></div>
            <div className="info-row"><dt>Denials / rework</dt><dd style={{ textTransform: "capitalize" }}>{r}</dd></div>
            {call.qualification?.reason && <div className="info-row"><dt>Reason</dt><dd style={{ textAlign: "right" }}>{call.qualification.reason}</dd></div>}
          </div>

          {(call.prior_auth?.pain_points?.length || call.prior_auth?.tools_systems?.length) ? (
            <div className="info-card">
              <h4>Prior-auth workflow</h4>
              {call.prior_auth?.pain_points?.length > 0 && (
                <>
                  <div className="info-row" style={{ borderBottom: "none", paddingBottom: 2 }}><dt>Pain points</dt><dd></dd></div>
                  <div className="tag-wrap" style={{ marginBottom: 10 }}>
                    {call.prior_auth.pain_points.map((p, i) => <span className="tag" key={i}>{p}</span>)}
                  </div>
                </>
              )}
              {call.prior_auth?.tools_systems?.length > 0 && (
                <>
                  <div className="info-row" style={{ borderBottom: "none", paddingBottom: 2 }}><dt>Tools</dt><dd></dd></div>
                  <div className="tag-wrap">
                    {call.prior_auth.tools_systems.map((p, i) => <span className="tag" key={i}>{p}</span>)}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div className="info-card">
            <h4>Follow-up</h4>
            <div className="info-row"><dt>Needed</dt><dd>{call.follow_up?.needs_follow_up ? "Yes" : "No"}</dd></div>
            <div className="info-row"><dt>Next step</dt><dd style={{ textAlign: "right" }}>{call.follow_up?.next_step || "—"}</dd></div>
            <div className="info-row"><dt>Timeframe</dt><dd style={{ textTransform: "capitalize" }}>{(call.follow_up?.follow_up_timeframe || "unknown").replace("_", " ")}</dd></div>
            {call.follow_up?.scheduled_time_iso && (
              <div className="info-row"><dt>Scheduled</dt><dd>{fmtDateTime(call.follow_up.scheduled_time_iso)}</dd></div>
            )}
          </div>

          <div className="info-card">
            <h4>Summary</h4>
            <div className="summary-text">{call.summaryText || "No summary captured for this call."}</div>
          </div>
        </div>

        <div className="transcript-card">
          <div className="transcript-head">
            <h3>Call transcript</h3>
            <span style={{ fontSize: 12, color: "var(--ink-300)", fontWeight: 600 }}>{messages.length} turns</span>
          </div>

          {call.recordingUrl ? (
            <div className="audio-wrap">
              <audio ref={audioRef} controls src={call.recordingUrl} />
            </div>
          ) : (
            <div className="no-recording">No recording available for this call.</div>
          )}

          <div className="transcript-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input placeholder="Search within transcript…" value={tSearch} onChange={(e) => setTSearch(e.target.value)} />
          </div>

          <div className="transcript-body">
            {messages.length === 0 ? (
              <div className="empty-inline">
                {call.transcript ? (
                  <div style={{ textAlign: "left", whiteSpace: "pre-wrap", fontSize: 13, color: "var(--ink-700)" }}>{call.transcript}</div>
                ) : (
                  "No transcript available for this call."
                )}
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="empty-inline">No lines match &quot;{tSearch}&quot;</div>
            ) : (
              visibleMessages.map((m, i) => (
                <div className={`bubble-row ${m.role}`} key={i} style={{ animationDelay: `${Math.min(i, 25) * 0.02}s` }}>
                  <div className="who-label">{m.role === "assistant" ? "Riley" : "Caller"}</div>
                  <div className="bubble" style={{ [m.role === "assistant" ? "borderTopLeftRadius" : "borderTopRightRadius"]: 4 }} onClick={() => seek(m)}>
                    {tSearch
                      ? highlightSearch(m.text, tSearch)
                      : m.role === "user"
                      ? highlightKeywords(m.text, callerKeywordWords)
                      : m.text}
                  </div>
                  {typeof m.secondsFromStart === "number" && (
                    <div className="bubble-time">{fmtDuration(m.secondsFromStart)}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
