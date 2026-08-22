// Fresh preview deployment probe after Preview secret scope update.
function classify(value: string | undefined) {
  const raw = (value ?? "").trim();
  return {
    configured: Boolean(raw),
    kind: !raw ? "missing" : raw.startsWith("sb_secret_") ? "modern_secret" : raw.startsWith("sb_publishable_") ? "modern_publishable" : raw.startsWith("eyJ") && raw.split(".").length === 3 ? "legacy_jwt" : "unknown",
    length: raw.length,
  };
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    legacyName: classify(process.env.SUPABASE_SERVICE_ROLE_KEY),
    modernName: classify(process.env.SUPABASE_SECRET_KEY),
  }, { headers: { "Cache-Control": "no-store" } });
}
