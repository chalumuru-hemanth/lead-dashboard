"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const OUTCOME_LABEL = {
  connected: "Connected",
  left_voicemail: "Left voicemail",
  no_answer: "No answer",
  not_interested: "Not interested",
  call_back_requested: "Call back requested",
  meeting_scheduled: "Meeting scheduled",
  other: "Other",
};
const OUTCOME_STYLE = {
  meeting_scheduled: { c: "var(--brand-strong)", bg: "var(--brand-tint)" },
  connected: { c: "var(--info-ink)", bg: "var(--info-tint)" },
  call_back_requested: { c: "#8A5A08", bg: "var(--warn-tint)" },
  not_interested: { c: "var(--danger)", bg: "var(--danger-tint)" },
  left_voicemail: { c: "var(--ink-400)", bg: "var(--surface-2)" },
  no_answer: { c: "var(--ink-400)", bg: "var(--surface-2)" },
  other: { c: "var(--ink-400)", bg: "var(--surface-2)" },
};
const URGENCY_STYLE = {
  high: { c: "var(--danger)", bg: "var(--danger-tint)", label: "High" },
  medium: { c: "#8A5A08", bg: "var(--warn-tint)", label: "Medium" },
  low: { c: "var(--ink-400)", bg: "var(--surface-2)", label: "Low" },
};
const SENT_ICON = { positive: "🙂", neutral: "😐", negative: "🙁" };
const POLL_MS = 20000;

function rework(c) {
  return (c.prior_auth && c.prior_auth.denials_rework_level) || "unknown";
}
function urgency(c) {
  return (c.qualification && c.qualification.urgency) || "low";
}
function needsFollowUp(c) {
  return !!(c.follow_up && c.follow_up.needs_follow_up);
}
function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Badge({ label, style }) {
  return (
    <span className="badge" style={{ color: style.c, background: style.bg }}>
      <span className="pd" style={{ background: style.c }} />
      {label}
    </span>
  );
}

function Row({ c, expanded, onToggle }) {
  const os = OUTCOME_STYLE[c.outcome] || OUTCOME_STYLE.other;
  const us = URGENCY_STYLE[urgency(c)];
  const contact = c.contact || {};
  return (
    <>
      <div className={`row${expanded ? " expanded" : ""}`} onClick={() => onToggle(c.id)}>
        <div className="cell-title">
          <div className="t">
            {contact.full_name || "Unknown caller"}
            {!c.hasStructuredData && <span className="legacy-pill">No structured data</span>}
          </div>
          <div className="s">
            {contact.role_title || "—"}
            {contact.organization && contact.organization !== "—" ? ` · ${contact.organization}` : ""}
          </div>
        </div>
        <div>
          <Badge label={c.outcome ? OUTCOME_LABEL[c.outcome] || c.outcome : "Unknown"} style={c.outcome ? os : OUTCOME_STYLE.other} />
        </div>
        <div>{c.qualification ? <Badge label={us.label} style={us} /> : "—"}</div>
        <div className="sent">{SENT_ICON[c.sentiment] || ""}</div>
        <div className="cell-title">
          <div className="t" style={{ fontWeight: 600, fontSize: 12.5 }}>
            {(c.follow_up && c.follow_up.next_step) || "—"}
          </div>
          <div className="s">
            {needsFollowUp(c)
              ? ((c.follow_up.follow_up_timeframe || "unknown") + "").replace("_", " ")
              : "no action needed"}
          </div>
        </div>
        <div className="when">{timeAgo(c.createdAt)}</div>
        <div className="chev-toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="detail">
        <div className="dl">
          <div>
            <dt>Intent</dt>
            <dd>{c.intent ? c.intent.replace("_", " ") : "—"}</dd>
          </div>
          <div>
            <dt>Denials / rework</dt>
            <dd>{rework(c)}</dd>
          </div>
          <div>
            <dt>Good fit</dt>
            <dd>
              {c.qualification && c.qualification.is_good_fit === true
                ? "Yes"
                : c.qualification && c.qualification.is_good_fit === false
                ? "No"
                : "—"}
            </dd>
          </div>
        </div>
        {c.prior_auth && c.prior_auth.pain_points && c.prior_auth.pain_points.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <dt style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-300)", marginBottom: 4, display: "block" }}>
              Pain points
            </dt>
            <div className="chips">
              {c.prior_auth.pain_points.map((p, i) => (
                <span className="chip" key={i}>{p}</span>
              ))}
            </div>
          </div>
        )}
        <div className="summary">{c.summaryText || "No summary captured for this call."}</div>
        {c.recordingUrl && (
          <a className="reclink" href={c.recordingUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            ▶ Listen to recording
          </a>
        )}
      </div>
    </>
  );
}

export default function Page() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ outcome: [], urgency: [], rework: [], followup: [] });
  const [groupBy, setGroupBy] = useState("outcome");
  const [expanded, setExpanded] = useState(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calls", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Request failed (${res.status})`);
      } else {
        setCalls(data.calls || []);
        setFetchedAt(data.fetchedAt || new Date().toISOString());
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const toggleFilter = (group, val) => {
    setFilters((f) => {
      const set = new Set(f[group]);
      set.has(val) ? set.delete(val) : set.add(val);
      return { ...f, [group]: Array.from(set) };
    });
  };
  const clearFilters = () => setFilters({ outcome: [], urgency: [], rework: [], followup: [] });

  const matches = useCallback(
    (c) => {
      if (filters.outcome.length && !filters.outcome.includes(c.outcome)) return false;
      if (filters.urgency.length && !filters.urgency.includes(urgency(c))) return false;
      if (filters.rework.length && !filters.rework.includes(rework(c))) return false;
      if (filters.followup.length) {
        const v = needsFollowUp(c) ? "yes" : "no";
        if (!filters.followup.includes(v)) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const contact = c.contact || {};
        const hay = [contact.full_name, contact.organization, contact.role_title, c.summaryText].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [filters, search]
  );

  const filtered = useMemo(() => calls.filter(matches), [calls, matches]);

  const groupKey = (c) => {
    if (groupBy === "outcome") return c.outcome || "other";
    if (groupBy === "urgency") return urgency(c);
    if (groupBy === "followup") return needsFollowUp(c) ? "yes" : "no";
    return "all";
  };
  const groupLabel = (k) => {
    if (groupBy === "outcome") return OUTCOME_LABEL[k] || k;
    if (groupBy === "urgency") return (URGENCY_STYLE[k] || {}).label || k;
    if (groupBy === "followup") return k === "yes" ? "Needs follow-up" : "No action needed";
    return "All calls";
  };
  const groupColor = (k) => {
    if (groupBy === "outcome") return (OUTCOME_STYLE[k] || OUTCOME_STYLE.other).c;
    if (groupBy === "urgency") return (URGENCY_STYLE[k] || URGENCY_STYLE.low).c;
    if (groupBy === "followup") return k === "yes" ? "var(--danger)" : "var(--grey-200)";
    return "var(--ink-400)";
  };

  const groupOrder =
    groupBy === "outcome"
      ? ["meeting_scheduled", "call_back_requested", "connected", "left_voicemail", "no_answer", "not_interested", "other"]
      : groupBy === "urgency"
      ? ["high", "medium", "low"]
      : groupBy === "followup"
      ? ["yes", "no"]
      : ["all"];

  const buckets = useMemo(() => {
    const b = {};
    filtered.forEach((c) => {
      const k = groupKey(c);
      (b[k] = b[k] || []).push(c);
    });
    return b;
  }, [filtered, groupBy]);

  const toggleExpand = (id) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleGroup = (k) => setCollapsedGroups((s) => ({ ...s, [k]: !s[k] }));

  const structured = calls.filter((c) => c.hasStructuredData);
  const needFollow = structured.filter(needsFollowUp).length;
  const meetings = structured.filter((c) => c.outcome === "meeting_scheduled").length;
  const highUrg = structured.filter((c) => urgency(c) === "high").length;
  const uc = { high: 0, medium: 0, low: 0 };
  structured.forEach((c) => (uc[urgency(c)] = (uc[urgency(c)] || 0) + 1));
  const totalForSpark = structured.length || 1;
  const activeFilterCount = filters.outcome.length + filters.urgency.length + filters.rework.length + filters.followup.length;

  return (
    <div className="app">
      <aside className="side">
        <div className="center">
          <div className="mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M3 6h11l-6 12z" fill="#00FF7D" />
              <path d="M13 4l8 14h-8z" fill="#00FF7D" opacity=".55" />
            </svg>
          </div>
          <div>
            <div className="name">Caldarium</div>
            <div className="sub">Voice · Riley</div>
          </div>
        </div>
        <nav className="nav">
          <a className="on" href="#">
            <svg className="ic" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Lead analysis
          </a>
        </nav>
        <div className="nudge">
          <h4>Live data</h4>
          <p>Polling Vapi&apos;s API every {POLL_MS / 1000}s for assistant Riley&apos;s calls. Refresh the page any time for the latest.</p>
        </div>
      </aside>

      <div className="main">
        <div className="top">
          <h1>Lead analysis</h1>
          <div className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input placeholder="Search name, org, or summary…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="right">
            <span className="status">{fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : ""}</span>
            <button className="iconbtn" title="Refresh now" onClick={load} disabled={loading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 4v5h5M20 20v-5h-5M4.6 15A8 8 0 0019 9M19.4 9A8 8 0 005 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="avatar">HC</div>
          </div>
        </div>

        <div className="content">
          {error && (
            <div className="notice error">
              <span>⚠</span>
              <span>
                <b>Couldn&apos;t load calls.</b> {error}
              </span>
            </div>
          )}
          {!error && !loading && calls.length > 0 && calls.every((c) => !c.hasStructuredData) && (
            <div className="notice">
              <span>ⓘ</span>
              <span>
                None of the fetched calls have <code>analysis.structuredData</code> yet — they predate enabling Riley&apos;s
                structured extraction, or that call hasn&apos;t finished analysis. New calls will populate automatically.
              </span>
            </div>
          )}

          {loading && calls.length === 0 ? (
            <div className="skeleton">Loading calls from Vapi…</div>
          ) : (
            <>
              <div className="bento">
                <div className="tile hero">
                  <div className="k">Calls analyzed</div>
                  <div className="v">{calls.length}</div>
                  <div className="meta">{structured.length} with structured data</div>
                  <svg className="glyph" width="120" height="120" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h11l-6 12z" fill="#00FF7D" />
                    <path d="M13 4l8 14h-8z" fill="#fff" />
                  </svg>
                </div>
                <div className="tile">
                  <div className="k">Needs follow-up</div>
                  <div className="v">{needFollow}</div>
                  <div className="spark">
                    <i style={{ width: `${(uc.high / totalForSpark) * 100}%`, background: "var(--danger)" }} />
                    <i style={{ width: `${(uc.medium / totalForSpark) * 100}%`, background: "var(--warn)" }} />
                    <i style={{ width: `${(uc.low / totalForSpark) * 100}%`, background: "var(--grey-100)" }} />
                  </div>
                </div>
                <div className="tile">
                  <div className="k">Meetings scheduled</div>
                  <div className="v">{meetings}</div>
                  <div className="meta">of {structured.length} analyzed calls</div>
                </div>
                <div className="tile">
                  <div className="k">High urgency</div>
                  <div className="v" style={{ color: "var(--danger)" }}>{highUrg}</div>
                  <div className="meta">flagged by Riley&apos;s qualification step</div>
                </div>
              </div>

              <div className="toolbar">
                <div className={`filterwrap${filterOpen ? " open" : ""}`}>
                  <button className="filterbtn" onClick={() => setFilterOpen((o) => !o)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    Filters
                    <span className="fcount">{activeFilterCount}</span>
                  </button>
                  <div className="filterpanel">
                    <div className="fgroup">
                      <div className="ft">Outcome</div>
                      <div className="fchips">
                        {Object.keys(OUTCOME_LABEL).map((k) => (
                          <button key={k} className={`fchip${filters.outcome.includes(k) ? " on" : ""}`} onClick={() => toggleFilter("outcome", k)}>
                            {OUTCOME_LABEL[k]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fgroup">
                      <div className="ft">Urgency</div>
                      <div className="fchips">
                        {["high", "medium", "low"].map((k) => (
                          <button key={k} className={`fchip${filters.urgency.includes(k) ? " on" : ""}`} onClick={() => toggleFilter("urgency", k)}>
                            {URGENCY_STYLE[k].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fgroup">
                      <div className="ft">Denials / rework level</div>
                      <div className="fchips">
                        {["high", "medium", "low", "unknown"].map((k) => (
                          <button key={k} className={`fchip${filters.rework.includes(k) ? " on" : ""}`} onClick={() => toggleFilter("rework", k)}>
                            {k[0].toUpperCase() + k.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fgroup">
                      <div className="ft">Follow-up</div>
                      <div className="fchips">
                        <button className={`fchip${filters.followup.includes("yes") ? " on" : ""}`} onClick={() => toggleFilter("followup", "yes")}>
                          Needs follow-up
                        </button>
                        <button className={`fchip${filters.followup.includes("no") ? " on" : ""}`} onClick={() => toggleFilter("followup", "no")}>
                          No action needed
                        </button>
                      </div>
                    </div>
                    <div className="fpfoot">
                      <button className="fclear" onClick={clearFilters}>Clear all</button>
                      <span className="fresult">{filtered.length} call{filtered.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                </div>

                <div className={`viewdd${viewOpen ? " open" : ""}`}>
                  <button className="ddtrigger" onClick={() => setViewOpen((o) => !o)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M4 7h6M4 12h6M4 17h6M14 7h6M14 12h6M14 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>
                      {groupBy === "outcome" && "Group by outcome"}
                      {groupBy === "urgency" && "Group by urgency"}
                      {groupBy === "followup" && "Group by follow-up"}
                      {groupBy === "none" && "No grouping"}
                    </span>
                    <svg className="cv" width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <div className="ddmenu">
                    {[
                      ["outcome", "Group by outcome"],
                      ["urgency", "Group by urgency"],
                      ["followup", "Group by follow-up"],
                      ["none", "No grouping"],
                    ].map(([val, label]) => (
                      <button key={val} className={groupBy === val ? "on" : ""} onClick={() => { setGroupBy(val); setViewOpen(false); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="empty">No calls match these filters.</div>
              ) : (
                groupOrder
                  .filter((k) => buckets[k] && buckets[k].length)
                  .map((k) => (
                    <div key={k} className={`group${collapsedGroups[k] ? " collapsed" : ""}`}>
                      <div className="ghead" onClick={() => toggleGroup(k)}>
                        <span className="dot" style={{ background: groupColor(k) }} />
                        {groupLabel(k)}
                        <span className="n">{buckets[k].length}</span>
                        <svg className="lchev" width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="rows">
                        {buckets[k].map((c) => (
                          <Row key={c.id} c={c} expanded={expanded.has(c.id)} onToggle={toggleExpand} />
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
