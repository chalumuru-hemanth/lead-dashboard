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
