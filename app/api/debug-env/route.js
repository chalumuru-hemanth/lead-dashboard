// Temporary diagnostic route -- reports presence/shape of required env vars
// WITHOUT leaking secret values, to debug why Supabase wasn't picking up.
// Safe to delete once the Supabase pipeline is confirmed working.
export const dynamic = "force-dynamic";

function describe(name) {
  const v = process.env[name];
  if (v === undefined) return { present: false };
  return {
    present: true,
    length: v.length,
    trimmedLength: v.trim().length,
    hasLeadingOrTrailingWhitespace: v !== v.trim(),
    preview: name.includes("KEY") || name.includes("SECRET") ? undefined : v.slice(0, 25),
  };
}

export async function GET() {
  return Response.json({
    SUPABASE_URL: describe("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: describe("SUPABASE_SERVICE_ROLE_KEY"),
    CRON_SECRET: describe("CRON_SECRET"),
    VAPI_PRIVATE_KEY: describe("VAPI_PRIVATE_KEY"),
    checkedAt: new Date().toISOString(),
  });
}
