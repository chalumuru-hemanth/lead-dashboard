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
import { useCountUp } from "@/lib/hooks";
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
  extractKeywords,
} from "@/lib/constants";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "#151726", color: "#fff", padding: "9px 13px", borderRadius: 11, fontSize: 12, fontWeight: 600, border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 12px 30px -8px rgba(0,0,0,.6)" }}>
      {label ? <div style={{ opacity: 0.55, marginBottom: 3 }}>{label}</div> : null}
      {payload.map((p, i) => (
        <div key={i}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

function KpiIcon({ path }) {
  return (
    <span className="ic">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d={path} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Kpi({ label, value, icon, sub, subClass, decimals, format }) {
  const animated = useCountUp(typeof value === "number" ? value : 0, { decimals });
  const display = typeof value === "number" ? (format ? format(animated) : animated.toLocaleString()) : value;
  return (
    <div className="kpi fade-up">
      <div className="k"><KpiIcon path={icon} />{label}</div>
      <div className="v">{display}</div>
      <div className={`d${subClass ? " " + subClass : ""}`}>{sub}</div>
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

  // Trending topics: mined straight from what callers actually said, via the
  // summary/pain-point/reason/next-step text already present in the
  // lightweight list payload — no extra transcript fetches required.
  const keywordData = useMemo(() => {
    const texts = [];
    structured.forEach((c) => {
      if (c.summaryText) texts.push(c.summaryText);
      (c.prior_auth?.pain_points || []).forEach((p) => texts.push(p));
      (c.prior_auth?.tools_systems || []).forEach((p) => texts.push(p));
      if (c.qualification?.reason) texts.push(c.qualification.reason);
      if (c.follow_up?.next_step) texts.push(c.follow_up.next_step);
    });
    return extractKeywords(texts, { max: 18, minCount: 2, minLen: 4 });
  }, [structured]);
  const maxKw = keywordData.length ? keywordData[0].count : 1;
  const kwTier = (n) => (n >= maxKw * 0.7 ? "t1" : n >= maxKw * 0.4 ? "t2" : "t3");

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
        <div className="page-head">
          <div><h1>Overview</h1><p>Live analytics across every call Riley has completed.</p></div>
        </div>
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
          <div className="eyebrow"><span className="dot good" style={{ width: 6, height: 6, borderRadius: "50%" }} />Live</div>
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

      <div className="kpi-grid stagger">
        <Kpi
          label="Total calls"
          value={stats.total}
          icon="M4 19V10M12 19V5M20 19v-7"
          sub={`${structured.length} with structured data`}
        />
        <Kpi
          label="Needs follow-up"
          value={stats.needFollow}
          icon="M12 8v5l3 2M21 12a9 9 0 11-9-9 9 9 0 019 9z"
          sub={`${structured.length ? Math.round((stats.needFollow / structured.length) * 100) : 0}% of analyzed calls`}
        />
        <Kpi
          label="Meetings scheduled"
          value={stats.meetings}
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"
          sub={`${stats.conversion}% conversion rate`}
          subClass="up"
        />
        <Kpi
          label="Avg call length"
          value={stats.avgDuration || 0}
          icon="M12 6v6l4 2M22 12a10 10 0 11-10-10 10 10 0 0110 10z"
          sub="minutes:seconds"
          format={fmtDuration}
        />
      </div>

      {hotLeads.length > 0 && (
        <div className="callout fade-up">
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

      <div className="grid-2 fade-up">
        <div className="card">
          <h3>Call volume</h3>
          <div className="sub">Last 14 days</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={volumeData}>
              <defs>
                <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6D6BFF" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#6D6BFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#7A7DA0" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#7A7DA0" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="calls" stroke="#8B8AFF" strokeWidth={2.5} fill="url(#vol)" />
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
                  <Pie data={outcomeData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
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

      <div className="grid-3 fade-up">
        <div className="card">
          <h3>Urgency</h3>
          <div className="sub">Qualification signal</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={urgencyData} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9497B8", fontWeight: 600 }} axisLine={false} tickLine={false} width={62} />
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
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#9497B8", fontWeight: 600 }} axisLine={false} tickLine={false} width={62} />
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

      <div className="card fade-up" style={{ marginBottom: 16 }}>
        <h3>Trending topics</h3>
        <div className="sub">Words and phrases surfacing most often across every caller&apos;s own words</div>
        {keywordData.length === 0 ? (
          <div className="empty-inline">Not enough conversation text yet to spot trends — check back after a few more calls.</div>
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

      <div className="card fade-up">
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
