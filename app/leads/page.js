"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCalls } from "../providers";
import {
  OUTCOME_LABEL,
  OUTCOME_COLOR,
  URGENCY_LABEL,
  URGENCY_COLOR,
  SENTIMENT_ICON,
  urgency,
  rework,
  needsFollowUp,
  contactName,
  fmtDuration,
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

function toCsv(rows) {
  const headers = ["Name", "Organization", "Role", "Intent", "Outcome", "Urgency", "Sentiment", "Needs follow-up", "Next step", "Duration (s)", "Created at"];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  rows.forEach((c) => {
    lines.push(
      [
        contactName(c),
        c.contact?.organization || "",
        c.contact?.role_title || "",
        c.intent || "",
        OUTCOME_LABEL[c.outcome] || c.outcome || "",
        URGENCY_LABEL[urgency(c)] || "",
        c.sentiment || "",
        needsFollowUp(c) ? "yes" : "no",
        c.follow_up?.next_step || "",
        c.durationSeconds != null ? Math.round(c.durationSeconds) : "",
        c.createdAt || "",
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
  a.download = `riley-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="page"><div className="skel-block" style={{ height: 400 }} /></div>}>
      <LeadsInner />
    </Suspense>
  );
}

function LeadsInner() {
  const { calls, loading, error } = useCalls();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState([]);
  const [urgencyFilter, setUrgencyFilter] = useState([]);
  const [reworkFilter, setReworkFilter] = useState([]);
  const [followupFilter, setFollowupFilter] = useState([]);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    const u = searchParams.get("urgency");
    const r = searchParams.get("rework");
    if (u) setUrgencyFilter([u]);
    if (r) setReworkFilter([r]);
  }, [searchParams]);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const filtered = useMemo(() => {
    let list = calls.filter((c) => {
      if (outcomeFilter.length && !outcomeFilter.includes(c.outcome)) return false;
      if (urgencyFilter.length && !urgencyFilter.includes(urgency(c))) return false;
      if (reworkFilter.length && !reworkFilter.includes(rework(c))) return false;
      if (followupFilter.length) {
        const v = needsFollowUp(c) ? "yes" : "no";
        if (!followupFilter.includes(v)) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [contactName(c), c.contact?.organization, c.contact?.role_title, c.summaryText].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let av, bv;
      if (sortKey === "createdAt") { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
      else if (sortKey === "name") { av = contactName(a); bv = contactName(b); }
      else if (sortKey === "urgency") { const order = { high: 2, medium: 1, low: 0 }; av = order[urgency(a)]; bv = order[urgency(b)]; }
      else if (sortKey === "duration") { av = a.durationSeconds || 0; bv = b.durationSeconds || 0; }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [calls, search, outcomeFilter, urgencyFilter, reworkFilter, followupFilter, sortKey, sortDir]);

  const setSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortIcon = (key) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "");

  const clearAll = () => {
    setOutcomeFilter([]); setUrgencyFilter([]); setReworkFilter([]); setFollowupFilter([]); setSearch("");
  };
  const activeCount = outcomeFilter.length + urgencyFilter.length + reworkFilter.length + followupFilter.length;

  if (loading && calls.length === 0) {
    return <div className="page"><div className="skel-block" style={{ height: 460 }} /></div>;
  }

  return (
    <div className="page">
      <div className="page-head fade-up">
        <div>
          <h1>Leads</h1>
          <p>Every call Riley has made, searchable and filterable. Click a row to read the transcript and full detail.</p>
        </div>
      </div>

      {error && (
        <div className="notice error"><span>⚠</span><span><b>Couldn&apos;t load calls.</b> {error}</span></div>
      )}

      <div className="toolbar fade-up">
        <div className="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input placeholder="Search name, org, summary…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chip-row">
          {Object.keys(OUTCOME_LABEL).map((k) => (
            <button key={k} className={`chip${outcomeFilter.includes(k) ? " on" : ""}`} onClick={() => toggle(outcomeFilter, setOutcomeFilter, k)}>
              {OUTCOME_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {["high", "medium", "low"].map((k) => (
            <button key={k} className={`chip${urgencyFilter.includes(k) ? " on" : ""}`} onClick={() => toggle(urgencyFilter, setUrgencyFilter, k)}>
              {URGENCY_LABEL[k]} urgency
            </button>
          ))}
        </div>
        <div className="chip-row">
          <button className={`chip${followupFilter.includes("yes") ? " on" : ""}`} onClick={() => toggle(followupFilter, setFollowupFilter, "yes")}>Needs follow-up</button>
        </div>
        {activeCount > 0 && (
          <button className="chip" onClick={clearAll} style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Clear filters ({activeCount})</button>
        )}
        <button className="btn" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0} title="Export the currently filtered leads as CSV">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Export CSV
        </button>
        <span className="result-count">{filtered.length} lead{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="table-wrap"><div className="empty">No calls match these filters.</div></div>
      ) : (
        <div className="table-wrap fade-up">
          <div className="table-head">
            <button onClick={() => setSort("name")}>Lead {sortIcon("name")}</button>
            <span>Intent</span>
            <span>Outcome</span>
            <button onClick={() => setSort("urgency")}>Urgency {sortIcon("urgency")}</button>
            <span>Feel</span>
            <span>Follow-up</span>
            <button onClick={() => setSort("duration")}>Length {sortIcon("duration")}</button>
            <button onClick={() => setSort("createdAt")}>When {sortIcon("createdAt")}</button>
          </div>
          {filtered.map((c, i) => (
            <Link key={c.id} href={`/leads/${c.id}`} className="table-row fade-in" style={{ animationDelay: `${Math.min(i, 20) * 0.02}s` }}>
              <div>
                <div className="lead-name">
                  {contactName(c)}
                  {!c.hasStructuredData && <span className="legacy-tag">No data</span>}
                </div>
                <div className="lead-sub">{c.contact?.role_title || "—"}{c.contact?.organization ? ` · ${c.contact.organization}` : ""}</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", fontWeight: 600 }}>{c.intent ? c.intent.replace("_", " ") : "—"}</div>
              <div>{c.outcome ? <Badge label={OUTCOME_LABEL[c.outcome] || c.outcome} color={OUTCOME_COLOR[c.outcome] || "#94A3B8"} /> : "—"}</div>
              <div>{c.qualification ? <Badge label={URGENCY_LABEL[urgency(c)]} color={URGENCY_COLOR[urgency(c)]} /> : "—"}</div>
              <div className="sent-ico">{SENTIMENT_ICON[c.sentiment] || ""}</div>
              <div className="lead-sub" style={{ fontSize: 12.5 }}>{needsFollowUp(c) ? (c.follow_up?.next_step || "Yes") : "No action needed"}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-400)", fontWeight: 600 }}>{fmtDuration(c.durationSeconds)}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-400)", fontWeight: 600, textAlign: "right" }}>{timeAgo(c.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
