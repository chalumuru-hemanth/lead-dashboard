"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCalls } from "../providers";
import { contactName, OUTCOME_LABEL, timeAgo } from "@/lib/constants";

export default function CommandPalette({ open, onOpenChange }) {
  const router = useRouter();
  const { calls } = useCalls();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  // global Cmd/Ctrl+K shortcut, and Escape to close
  useEffect(() => {
    function onKey(e) {
      const isK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (isK) {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = query
      ? calls.filter((c) => {
          const hay = [contactName(c), c.contact?.organization, c.contact?.role_title, c.summaryText]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(query);
        })
      : calls.slice(0, 8);
    return base.slice(0, 8);
  }, [calls, q]);

  useEffect(() => setActive(0), [q]);

  const go = (c) => {
    onOpenChange(false);
    router.push(`/leads/${c.id}`);
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={() => onOpenChange(false)}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a lead by name, org, or summary…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && results[active]) go(results[active]);
            }}
          />
        </div>
        <div className="cmdk-list">
          {results.length === 0 ? (
            <div className="cmdk-empty">No leads match &quot;{q}&quot;</div>
          ) : (
            results.map((c, i) => (
              <div
                key={c.id}
                className={`cmdk-item${i === active ? " active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c)}
              >
                <div>
                  <div className="nm">{contactName(c)}</div>
                  <div className="sb">{c.contact?.organization || c.contact?.role_title || "No org captured"}</div>
                </div>
                <div className="sb">{OUTCOME_LABEL[c.outcome] || "—"} · {timeAgo(c.createdAt)}</div>
              </div>
            ))
          )}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
