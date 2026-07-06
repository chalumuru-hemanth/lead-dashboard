"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { useCalls } from "./providers";
import {
  OUTCOME_LABEL,
  OUTCOME_COLOR,
  URGENCY_LABEL,
  URGENCY_COLOR,
  SENTIMENT_COLOR,
  urgency,
  rework,
  needsFollowUp,
  contactName,
  fmtDuration,
  fmtDateTime,
  dayKey,
} from "@/lib/constants";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "#0F1222", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
      {label ? <div style={{ opacity: 0.6, marginBottom: 2 }}>{label}</div> : null}
      {payload.map((p, i) => (
        <div key={i}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { calls, loading, error } = useCalls();
  const structured = useMemo(() => calls.filter((c) => c.hasStructuredData), [calls]);

  const stats = useMemo(() => {
    const total = calls.length;
    const needFollow = structured.filter(needsFollowUp).length;
    const meetings = structured.filter((c) => c.outcome === "meeting_scheduled").length;
    const conversion = structured.length ? Math.round((meetings / structured.length) * 100) : 0;
    const durations = calls.map((c) => c.durationSeconds).filter((d) => typeof d === "number");
    const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    return { total, needFollow, meetings, conversion, avgDuration };
  }, [calls, structured]);

  const outcomeData = useMemo(() => {
    const counts = {};
    structured.forEach((c) => {
      const k = c.outcome || "other";
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.keys(counts).map((k) => ({
      name: OUTCOME_LABEL[k] || k,
      value: counts[k],
      color: OUTCOME_COLOR[k] || "#94A3B8",
    }));
  }, [structured]);

  const urgencyData = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    structured.forEach((c) => (counts[urgency(c)] = (counts[urgency(c)] || 0) + 1));
    return ["high", "medium", "low"].map((k) => ({
      name: URGENCY_LABEL[k],
      value: counts[k],
      color: URGENCY_COLOR[k],
    }));
  }, [structured]);

  const sentimentData = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    structured.forEach((c) => {
      const s = c.sentiment || "neutral";
      counts[s] = (counts[s] || 0) + 1;
    });
    return ["positive", "neutral", "negative"].map((k) => ({
      name: k[0].toUpperCase() + k.slice(1),
      value: counts[k],
      color: SENTIMENT_COLOR[k],
    }));
  }, [structured]);

  const volumeData = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const counts = {};
    calls.forEach((c) => {
      const k = dayKey(c.createdAt);
      counts[k] = (counts[k] || 0) + 1;
    });
    return days.map((d) => ({
      day: new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      calls: counts[d] || 0,
    }));
  }, [calls]);

  const painPoints = useMemo(() => {
    const counts = {};
    structured.forEach((c) => {
      (c.prior_auth?.pain_points || []).forEach((p) => {
        counts[p] = (counts[p] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [structured]);
  const maxPain = painPoints.length ? painPoints[0][1] : 1;

  const hotLeads = useMemo(
    () => structured.filter((c) => urgency(c) === "high" && rework(c) === "high"),
    [structured]
  );

  const recentFollowUps = useMemo(
    () =>
      structured
        .filter(needsFollowUp)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
    [structured]
  );

  if (loading && calls.length === 0) {
    return (
      <div className="page">
        <div className="skeleton">Loading calls from Vapi…</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Live analytics across every call Riley has completed — refreshes automatically as new leads come in.</p>
        </div>
      </div>

      {error && (
        <div className="notice error">
          <span>⚠</span>
          <span><b>Couldn&apos;t load calls.</b> {error}</span>
        </div>
      )}

      {!error && calls.length > 0 && structured.length === 0 && (
        <div className="notice">
          <span>ⓘ</span>
          <span>None of the fetched calls have structured data yet. Charts will populate once Riley finishes analyzing a call.</span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="k">Total calls</div>
          <div className="v">{stats.total}</div>
          <div className="d">{structured.length} with structured data</div>
        </div>
        <div className="kpi">
          <div className="k">Needs follow-up</div>
          <div className="v">{stats.needFollow}</div>
          <div className="d">{structured.length ? Math.round((stats.needFollow / structured.length) * 100) : 0}% of analyzed calls</div>
        </div>
        <div className="kpi">
          <div className="k">Meetings scheduled</div>
          <div className="v">{stats.meetings}</div>
          <div className="d up">{stats.conversion}% conversion rate</div>
        </div>
        <div className="kpi">
          <div className="k">Avg call length</div>
          <div className="v">{fmtDuration(stats.avgDuration)}</div>
          <div className="d">minutes:seconds</div>
        </div>
      </div>

      {hotLeads.length > 0 && (
        <div className="callout">
          <div className="ci">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" fill="#fff" /></svg>
          </div>
          <div>
            <h4>{hotLeads.length} hot lead{hotLeads.length === 1 ? "" : "s"} — high urgency &amp; high denial/rework</h4>
            <p>These calls combine urgent qualification with a high denials-rework signal. Worth prioritizing today.</p>
          </div>
          <Link className="go" href="/leads?urgency=high&rework=high">Review now →</Link>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Call volume</h3>
          <div className="sub">Last 14 days</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={volumeData}>
              <defs>
                <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E9EAF3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#A7AABF" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#A7AABF" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="calls" stroke="#4F46E5" strokeWidth={2.5} fill="url(#vol)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Outcomes</h3>
          <div className="sub">{structured.length} analyzed calls</div>
          {outcomeData.length === 0 ? (
            <div className="empty-inline">No analyzed calls yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={outcomeData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                    {outcomeData.map((d, i) => (
                      <Cell key={i} fill={d.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend-row">
                {outcomeData.map((d, i) => (
                  <span className="legend-item" key={i}>
                    <span className="legend-dot" style={{ background: d.color }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <h3>Urgency</h3>
          <div className="sub">Qualification signal</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={urgencyData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#5B5F76", fontWeight: 600 }} axisLine={false} tickLine={false} width={62} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                {urgencyData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Sentiment</h3>
          <div className="sub">How the call felt</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={sentimentData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#5B5F76", fontWeight: 600 }} axisLine={false} tickLine={false} width={62} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                {sentimentData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Top pain points</h3>
          <div className="sub">Mentioned across calls</div>
          {painPoints.length === 0 ? (
            <div className="empty-inline">None captured yet</div>
          ) : (
            painPoints.map(([label, n], i) => (
              <div className="rank-row" key={i}>
                <span className="label" title={label}>{label}</span>
                <span className="rank-track"><span className="rank-fill" style={{ width: `${(n / maxPain) * 100}%` }} /></span>
                <span className="rank-n">{n}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h3>Needs follow-up</h3>
        <div className="sub">Most recent leads awaiting action</div>
        {recentFollowUps.length === 0 ? (
          <div className="empty-inline">Nothing waiting on you right now</div>
        ) : (
          <div className="table-wrap" style={{ boxShadow: "none" }}>
            {recentFollowUps.map((c) => (
              <Link key={c.id} href={`/leads/${c.id}`} className="table-row" style={{ gridTemplateColumns: "1.6fr 1fr 1.4fr 100px" }}>
                <div className="lead-name">{contactName(c)}<span className="lead-sub" style={{ marginLeft: 6, fontWeight: 500 }}>{c.contact?.role_title || ""}</span></div>
                <div>{OUTCOME_LABEL[c.outcome] || "—"}</div>
                <div className="lead-sub">{c.follow_up?.next_step || "—"}</div>
                <div style={{ textAlign: "right", color: "var(--ink-400)", fontWeight: 600, fontSize: 12 }}>{fmtDateTime(c.createdAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
