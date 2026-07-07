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
  CALL_QUALITY_LABEL,
  CALL_QUALITY_COLOR,
  urgency,
  needsFollowUp,
  callQuality,
  leadHeadline,
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
  const headers = ["Name", "Organization", "Role", "Call quality", "Outcome", "Urgency", "Sentiment", "Needs follow-up", "Next step", "Summary", "Duration (s)", "Created at"];
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
        CALL_QUALITY_LABEL[callQuality(c)] || "",
        OUTCOME_LABEL[c.outcome] || c.outcome || "",
        URGENCY_LABEL[urgency(c)] || "",
        c.sentiment || "",
        needsFollowUp(c) ? "yes" : "no",
        c.follow_up?.next_step || "",
        c.summaryText || "",
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

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "urgency", label: "Highest urgency" },
  { key: "duration", label: "Longest call" },
];

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
  const [qualityFilter, setQualityFilter] = useState("real"); // "real" | "all" | "failed"
  const [outcomeFilter, setOutcomeFilter] = useState([]);
  const [urgencyFilter, setUrgencyFilter] = useState([]);
  const [followupOnly, setFollowupOnly] = useState(false);
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    const u = searchParams.get("urgency");
    if (u) setUrgencyFilter([u]);
  }, [searchParams]);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const withQuality = useMemo(() => calls.map((c) => ({ ...c, _quality: callQuality(c) })), [calls]);

  const hiddenNoiseCount = useMemo(
    () => (qualityFilter === "real" ? withQuality.filter((c) => c._quality === "failed" || c._quality === "short").length : 0),
    [withQuality, qualityFilter]
  );

  const filtered = useMemo(() => {
    let list = withQuality.filter((c) => {
      if (qualityFilter === "real" && (c._quality === "failed" || c._quality === "short")) return false;
      if (qualityFilter === "failed" && c._quality !== "failed" && c._quality !== "short") return false;
      if (outcomeFilter.length && !outcomeFilter.includes(c.outcome)) return false;
      if (urgencyFilter.length && !urgencyFilter.includes(urgency(c))) return false;
      if (followupOnly && !needsFollowUp(c)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [contactName(c), c.contact?.organization, c.contact?.role_title, c.summaryText].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const order = { high: 2, medium: 1, low: 0 };
    list = [...list].sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === "urgency") return (order[urgency(b)] || 0) - (order[urgency(a)] || 0) || new Date(b.createdAt) - new Date(a.createdAt);
      if (sort === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return list;
  }, [withQuality, search, qualityFilter, outcomeFilter, urgencyFilter, followupOnly, sort]);

  const clearAll = () => {
    setOutcomeFilter([]); setUrgencyFilter([]); setFollowupOnly(false); setSearch("");
  };
  const activeCount = outcomeFilter.length + urgencyFilter.length + (followupOnly ? 1 : 0);

  if (loading && calls.length === 0) {
    return <div className="page"><div className="skel-block" style={{ height: 460 }} /></div>;
  }

  return (
    <div className="page">
      <div className="page-head fade-up">
        <div>
          <h1>Leads</h1>
          <p>Every call Riley has made, with the real conversations surfaced first. Click a lead to read the full transcript.</p>
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

        <div className="segmented">
          <button className={qualityFilter === "real" ? "on" : ""} onClick={() => setQualityFilter("real")}>Real conversations</button>
          <button className={qualityFilter === "all" ? "on" : ""} onClick={() => setQualityFilter("all")}>All calls</button>
          <button className={qualityFilter === "failed" ? "on" : ""} onClick={() => setQualityFilter("failed")}>Failed / too short</button>
        </div>

        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

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
          <button className={`chip${followupOnly ? " on" : ""}`} onClick={() => setFollowupOnly((v) => !v)}>Needs follow-up</button>
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

      {qualityFilter === "real" && hiddenNoiseCount > 0 && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <span>ⓘ</span>
          <span>
            {hiddenNoiseCount} failed or too-short call{hiddenNoiseCount === 1 ? "" : "s"} hidden.{" "}
            <button className="link-btn" onClick={() => setQualityFilter("all")}>Show all calls</button>
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="table-wrap"><div className="empty">No calls match these filters.</div></div>
      ) : (
        <div className="lead-list">
          {filtered.map((c, i) => {
            const q = c._quality;
            const u = urgency(c);
            return (
              <Link key={c.id} href={`/leads/${c.id}`} className="lead-card fade-in" style={{ animationDelay: `${Math.min(i, 20) * 0.02}s` }}>
                <div className="lead-card-top">
                  <div>
                    <div className="lead-name">
                      {contactName(c)}
                      {q !== "real" && <span className={`quality-tag ${q}`}>{CALL_QUALITY_LABEL[q]}</span>}
                    </div>
                    <div className="lead-sub">
                      {c.contact?.role_title || "Role unknown"}
                      {c.contact?.organization && c.contact.organization !== "—" ? ` · ${c.contact.organization}` : ""}
                    </div>
                  </div>
                  <div className="lead-card-meta">
                    <div>{timeAgo(c.createdAt)}</div>
                    <div>{fmtDuration(c.durationSeconds)} · ${(c.cost || 0).toFixed(2)}</div>
                  </div>
                </div>

                {q === "real" && (
                  <div className="badge-row" style={{ marginTop: 10 }}>
                    {c.outcome ? (
                      <Badge label={OUTCOME_LABEL[c.outcome] || c.outcome} color={OUTCOME_COLOR[c.outcome] || "#94A3B8"} />
                    ) : (
                      <Badge label={CALL_QUALITY_LABEL.unanalyzed} color={CALL_QUALITY_COLOR.unanalyzed} />
                    )}
                    {c.qualification && <Badge label={`${URGENCY_LABEL[u]} urgency`} color={URGENCY_COLOR[u]} />}
                    {c.sentiment && <span className="sent-ico" title={c.sentiment}>{SENTIMENT_ICON[c.sentiment]}</span>}
                  </div>
                )}

                <div className="lead-card-summary">{leadHeadline(c)}</div>

                {needsFollowUp(c) && (
                  <div className="lead-card-followup">
                    <span>→</span>
                    <span>{c.follow_up?.next_step || "Follow up with this lead"}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
