"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCalls } from "../providers";
import { timeAgo, needsFollowUp } from "@/lib/constants";
import CommandPalette from "./CommandPalette";
import PageTransition from "./PageTransition";

const NAV = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 19V10M12 19V5M20 19v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/leads",
    label: "Leads",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 12h16M4 18h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Shell({ children }) {
  const pathname = usePathname();
  const { calls, loading, error, fetchedAt, refresh } = useCalls();
  const followUpCount = calls.filter(needsFollowUp).length;
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="shell">
      <div className="bg-glow" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <aside className="rail">
        <div className="rail-brand">
          <div className="rail-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 4v5c0 4.4-3 8.3-7 9-4-.7-7-4.6-7-9V7l7-4z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="rail-name">Riley</div>
            <div className="rail-sub">Voice agent · Caldarium</div>
          </div>
        </div>

        <nav className="rail-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rail-link${isActive(n.href) ? " on" : ""}`}>
              <span className="ic">{n.icon}</span>
              {n.label}
              {n.href === "/leads" && followUpCount > 0 && <span className="rail-badge">{followUpCount}</span>}
            </Link>
          ))}
        </nav>

        <button
          className="rail-refresh"
          style={{ justifyContent: "space-between" }}
          onClick={() => setCmdkOpen(true)}
          title="Quick search (Cmd/Ctrl+K)"
        >
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Quick jump
          </span>
          <span className="rail-hint">{mac ? "⌘K" : "Ctrl K"}</span>
        </button>

        <div className="rail-foot">
          <div className="rail-status">
            <span className={`dot${error ? " bad" : loading ? " busy" : " good"}`} />
            {error ? "Connection issue" : fetchedAt ? `Synced ${timeAgo(fetchedAt)}` : "Connecting…"}
          </div>
          <button className="rail-refresh" onClick={refresh} disabled={loading} title="Refresh now">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 4v5h5M20 20v-5h-5M4.6 15A8 8 0 0019 9M19.4 9A8 8 0 005 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="kbar" onClick={() => setCmdkOpen(true)}>
            Search leads <kbd>{mac ? "⌘" : "Ctrl"} K</kbd>
          </button>
        </div>
        <PageTransition>{children}</PageTransition>
      </div>

      <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
    </div>
  );
}
