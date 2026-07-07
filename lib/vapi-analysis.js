// Vapi is migrating off `analysisPlan` (summaryPrompt + structuredDataPrompt/
// Schema, results in `call.analysis.*`) onto the newer "Structured Outputs"
// system (schema-based extractions you attach via `artifactPlan
// .structuredOutputIds`, results in `call.artifact.structuredOutputs`).
//
// This helper reads BOTH so nothing breaks mid-migration:
//   - Calls analyzed before you switch keep showing their legacy
//     `analysis.summary` / `analysis.structuredData`.
//   - Calls analyzed after you link the new Structured Outputs to Riley
//     automatically use those instead — no dashboard change needed once
//     it's wired up on the Vapi side.
//
// Matching is duck-typed (by shape, not a hardcoded output ID) so it keeps
// working regardless of what you name the Structured Outputs in Vapi:
//   - the one with a `summary` string field -> becomes summaryText
//   - the one with any of contact/qualification/follow_up/prior_auth/
//     intent/outcome -> becomes the structured lead data
export function extractAnalysis(c) {
  const legacy = c.analysis || {};
  let summary = null;
  let sd = null;

  const outputs = (c.artifact && c.artifact.structuredOutputs) || null;
  if (outputs && typeof outputs === "object") {
    Object.values(outputs).forEach((entry) => {
      const result = entry && entry.result;
      if (!result || typeof result !== "object") return;
      if (!summary && typeof result.summary === "string" && result.summary.trim()) {
        summary = result.summary.trim();
      }
      if (
        !sd &&
        (result.contact || result.qualification || result.follow_up || result.prior_auth || result.intent || result.outcome)
      ) {
        sd = result;
      }
    });
  }

  return {
    summary: summary || legacy.summary || c.summary || null,
    structuredData: sd || legacy.structuredData || null,
  };
}
