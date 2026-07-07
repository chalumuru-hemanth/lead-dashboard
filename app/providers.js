"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const CallsCtx = createContext(null);
const POLL_MS = 20000;

export function CallsProvider({ children }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

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
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <CallsCtx.Provider value={{ calls, loading, error, fetchedAt, refresh: load }}>
      {children}
    </CallsCtx.Provider>
  );
}

export function useCalls() {
  const ctx = useContext(CallsCtx);
  if (!ctx) throw new Error("useCalls must be used within a CallsProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Emails / outreach — polls the Apps Script bridge, and auto-triggers Gemini
// triage for any reply that hasn't been classified yet (or was re-replied to
// since the last classification). Triage results get merged in immediately
// and are also cached back in the Sheet, so subsequent polls (and page
// reloads) don't re-classify the same reply.
// ---------------------------------------------------------------------------

import { needsTriage } from "@/lib/constants";

const EmailsCtx = createContext(null);
const EMAILS_POLL_MS = 30000;

export function EmailsProvider({ children }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [triaging, setTriaging] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emails", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Request failed (${res.status})`);
      } else {
        setRows(data.rows || []);
        setFetchedAt(data.fetchedAt || new Date().toISOString());
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, EMAILS_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // After each load, kick off triage for anything un-classified. Runs at
  // most once per row per "reply generation" thanks to needsTriage's check
  // against aiProcessedAt, so this is cheap even on a 30s poll.
  useEffect(() => {
    const pending = rows.filter(needsTriage);
    if (pending.length === 0 || triaging) return;

    let cancelled = false;
    (async () => {
      setTriaging(true);
      try {
        const res = await fetch("/api/emails/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: pending.map((r) => ({
              threadId: r.threadId,
              firstName: r.firstName,
              organization: r.organization,
              replySubject: r.replySubject,
              replySnippet: r.replySnippet,
            })),
          }),
        });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.results) && data.results.length) {
          setRows((prev) =>
            prev.map((row) => {
              const hit = data.results.find((x) => x.threadId === row.threadId);
              if (!hit) return row;
              return {
                ...row,
                aiPriority: hit.priority || row.aiPriority,
                aiSummary: hit.summary || row.aiSummary,
                aiAction: hit.action || row.aiAction,
                aiProcessedAt: new Date().toISOString(),
              };
            })
          );
        }
      } catch {
        // silent — next poll will retry the same un-triaged rows
      } finally {
        if (!cancelled) setTriaging(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <EmailsCtx.Provider value={{ rows, loading, error, fetchedAt, triaging, refresh: load }}>
      {children}
    </EmailsCtx.Provider>
  );
}

export function useEmails() {
  const ctx = useContext(EmailsCtx);
  if (!ctx) throw new Error("useEmails must be used within an EmailsProvider");
  return ctx;
}
