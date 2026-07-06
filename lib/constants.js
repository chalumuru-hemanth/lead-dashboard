export const OUTCOME_LABEL = {
  connected: "Connected",
  left_voicemail: "Left voicemail",
  no_answer: "No answer",
  not_interested: "Not interested",
  call_back_requested: "Callback requested",
  meeting_scheduled: "Meeting scheduled",
  other: "Other",
};

export const OUTCOME_COLOR = {
  meeting_scheduled: "#10B981",
  connected: "#0EA5E9",
  call_back_requested: "#F59E0B",
  not_interested: "#F43F5E",
  left_voicemail: "#94A3B8",
  no_answer: "#B7BBCB",
  other: "#B7BBCB",
};

export const URGENCY_LABEL = { high: "High", medium: "Medium", low: "Low" };
export const URGENCY_COLOR = { high: "#F43F5E", medium: "#F59E0B", low: "#94A3B8" };

export const SENTIMENT_LABEL = { positive: "Positive", neutral: "Neutral", negative: "Negative" };
export const SENTIMENT_COLOR = { positive: "#10B981", neutral: "#94A3B8", negative: "#F43F5E" };
export const SENTIMENT_ICON = { positive: "🙂", neutral: "😐", negative: "🙁" };

export const INTENT_LABEL = {
  research: "Research",
  sales_interest: "Sales interest",
  support: "Support",
  scheduling: "Scheduling",
  other: "Other",
};

export function urgency(c) {
  return (c && c.qualification && c.qualification.urgency) || "low";
}
export function rework(c) {
  return (c && c.prior_auth && c.prior_auth.denials_rework_level) || "unknown";
}
export function needsFollowUp(c) {
  return !!(c && c.follow_up && c.follow_up.needs_follow_up);
}
export function contactName(c) {
  return (c && c.contact && c.contact.full_name) || "Unknown caller";
}

export function fmtDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayKey(iso) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Keyword mining — surfaces the words and phrases actually coming out of the
// person on the other end of the call. Used two ways:
//  1) Overview "Trending topics": mined from summaries / pain points /
//     qualification reasons already present in the lightweight list payload
//     (no extra transcript fetches needed, keeps the list route fast).
//  2) Lead detail "Key terms": mined live from that call's own caller turns
//     in the transcript, then used to highlight matches inline.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","so","of","to","in","on","at","for",
  "with","by","from","as","is","are","was","were","be","been","being","it","its",
  "this","that","these","those","i","you","we","they","he","she","them","us","our",
  "your","my","his","her","their","not","no","yes","do","does","did","doing","done",
  "have","has","had","having","will","would","could","should","can","may","might",
  "just","like","really","actually","basically","literally","kind","sort","um","uh",
  "yeah","okay","ok","well","right","think","know","mean","going","get","got","gonna",
  "want","wanted","need","needed","thing","things","one","two","lot","bit","also",
  "about","into","over","out","up","down","off","again","there","here","when","what",
  "which","who","whom","how","why","because","all","any","some","more","most","other",
  "than","too","very","much","many","still","even","back","call","calling","phone",
  "hello","hi","thanks","thank","please","sure","maybe","probably","definitely",
]);

export function extractKeywords(texts, { max = 14, minCount = 1, minLen = 4 } = {}) {
  const counts = {};
  (texts || []).filter(Boolean).forEach((text) => {
    const words = String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
    words.forEach((raw) => {
      const w = raw.replace(/^['-]+|['-]+$/g, "");
      if (w.length < minLen || STOPWORDS.has(w)) return;
      counts[w] = (counts[w] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([word, count]) => ({ word, count }));
}
