// Upsert helpers shared by the dual-write call routes and the comprehensive
// /api/sync cron job. Every function is best-effort: failures are logged to
// vapi_sync_log and swallowed so a Supabase hiccup never breaks the
// dashboard's live Vapi-backed views.
import { getSupabase } from "@/lib/supabase";

async function logSync(resource, status, detail) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("vapi_sync_log").insert({
      resource,
      status,
      detail: detail ? String(detail).slice(0, 2000) : null,
    });
  } catch {
    // best-effort only
  }
}

// ---- Calls -----------------------------------------------------------

export async function upsertCallSummary(raw) {
  // Called from the list route (/api/calls) -- lightweight, no transcript.
  const sb = getSupabase();
  if (!sb) return;
  try {
    const startedAt = raw.startedAt ? new Date(raw.startedAt) : null;
    const endedAt = raw.endedAt ? new Date(raw.endedAt) : null;
    const row = {
      id: raw.id,
      assistant_id: raw.assistantId || null,
      phone_number_id: raw.phoneNumberId || null,
      type: raw.type || null,
      status: raw.status || null,
      ended_reason: raw.endedReason || null,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds:
        startedAt && endedAt ? Math.max(0, (endedAt - startedAt) / 1000) : null,
      cost: typeof raw.cost === "number" ? raw.cost : null,
      cost_breakdown: raw.costBreakdown || null,
      customer_number: (raw.customer && raw.customer.number) || null,
      recording_url: raw.recordingUrl || (raw.artifact && raw.artifact.recordingUrl) || null,
      raw,
      last_synced_at: new Date().toISOString(),
    };
    await sb.from("vapi_calls").upsert(row, { onConflict: "id" });
  } catch (err) {
    await logSync("call", "error", err.message);
  }
}

export async function upsertCallDetail(raw, { transcript, messages, summary, vapiSummary, structuredData } = {}) {
  // Called from the detail route (/api/calls/[id]) -- full fidelity.
  const sb = getSupabase();
  if (!sb) return;
  try {
    const startedAt = raw.startedAt ? new Date(raw.startedAt) : null;
    const endedAt = raw.endedAt ? new Date(raw.endedAt) : null;
    const row = {
      id: raw.id,
      assistant_id: raw.assistantId || null,
      phone_number_id: raw.phoneNumberId || null,
      type: raw.type || null,
      status: raw.status || null,
      ended_reason: raw.endedReason || null,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds:
        startedAt && endedAt ? Math.max(0, (endedAt - startedAt) / 1000) : null,
      cost: typeof raw.cost === "number" ? raw.cost : null,
      cost_breakdown: raw.costBreakdown || null,
      customer_number: (raw.customer && raw.customer.number) || null,
      transcript: transcript || null,
      messages: messages || null,
      recording_url: raw.recordingUrl || (raw.artifact && raw.artifact.recordingUrl) || null,
      summary: summary || null,
      vapi_summary: vapiSummary || null,
      structured_data: structuredData || null,
      raw,
      last_synced_at: new Date().toISOString(),
    };
    await sb.from("vapi_calls").upsert(row, { onConflict: "id" });
  } catch (err) {
    await logSync("call_detail", "error", err.message);
  }
}

// ---- Generic simple-resource upsert -----------------------------------

async function upsertList(table, rows, mapRow) {
  const sb = getSupabase();
  if (!sb || !rows || !rows.length) return 0;
  const mapped = rows.map(mapRow);
  const { error } = await sb.from(table).upsert(mapped, { onConflict: "id" });
  if (error) throw error;
  return mapped.length;
}

export async function syncAssistants(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_assistants", list, (a) => ({
      id: a.id,
      name: a.name || null,
      org_id: a.orgId || null,
      created_at: a.createdAt || null,
      updated_at: a.updatedAt || null,
      raw: a,
      last_synced_at: now,
    }));
    // Version history: only insert a new snapshot if it differs from the last one.
    const sb = getSupabase();
    if (sb) {
      for (const a of list) {
        const { data: last } = await sb
          .from("vapi_assistant_snapshots")
          .select("snapshot")
          .eq("assistant_id", a.id)
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const changed = !last || JSON.stringify(last.snapshot) !== JSON.stringify(a);
        if (changed) {
          await sb.from("vapi_assistant_snapshots").insert({ assistant_id: a.id, snapshot: a });
        }
      }
    }
    await logSync("assistants", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("assistants", "error", err.message);
    return 0;
  }
}

export async function syncPhoneNumbers(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_phone_numbers", list, (p) => ({
      id: p.id,
      number: p.number || null,
      name: p.name || null,
      status: p.status || null,
      provider: p.provider || null,
      assistant_id: p.assistantId || null,
      raw: p,
      last_synced_at: now,
    }));
    await logSync("phone_numbers", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("phone_numbers", "error", err.message);
    return 0;
  }
}

export async function syncTools(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_tools", list, (t) => ({
      id: t.id,
      type: t.type || null,
      name: (t.function && t.function.name) || t.name || null,
      raw: t,
      last_synced_at: now,
    }));
    await logSync("tools", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("tools", "error", err.message);
    return 0;
  }
}

export async function syncSquads(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_squads", list, (s) => ({
      id: s.id,
      name: s.name || null,
      raw: s,
      last_synced_at: now,
    }));
    await logSync("squads", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("squads", "error", err.message);
    return 0;
  }
}

export async function syncFiles(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_files", list, (f) => ({
      id: f.id,
      name: f.name || null,
      status: f.status || null,
      raw: f,
      last_synced_at: now,
    }));
    await logSync("files", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("files", "error", err.message);
    return 0;
  }
}

export async function syncChats(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_chats", list, (c) => ({
      id: c.id,
      assistant_id: c.assistantId || null,
      raw: c,
      last_synced_at: now,
    }));
    await logSync("chats", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("chats", "error", err.message);
    return 0;
  }
}

export async function syncSessions(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_sessions", list, (s) => ({
      id: s.id,
      assistant_id: s.assistantId || null,
      status: s.status || null,
      raw: s,
      last_synced_at: now,
    }));
    await logSync("sessions", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("sessions", "error", err.message);
    return 0;
  }
}

export async function syncEvals(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_evals", list, (e) => ({
      id: e.id,
      name: e.name || null,
      raw: e,
      last_synced_at: now,
    }));
    await logSync("evals", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("evals", "error", err.message);
    return 0;
  }
}

export async function syncEvalRuns(list) {
  try {
    const now = new Date().toISOString();
    const count = await upsertList("vapi_eval_runs", list, (r) => ({
      id: r.id,
      eval_id: r.evalId || null,
      status: r.status || null,
      raw: r,
      last_synced_at: now,
    }));
    if (count) await logSync("eval_runs", "ok", `${count} synced`);
    return count;
  } catch (err) {
    await logSync("eval_runs", "error", err.message);
    return 0;
  }
}

export async function saveAnalyticsSnapshot(query, result) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("vapi_analytics_snapshots").insert({ query, result });
    await logSync("analytics", "ok", "snapshot saved");
  } catch (err) {
    await logSync("analytics", "error", err.message);
  }
}

export { logSync };
